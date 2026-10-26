// API の入口。/api/<名前> を engine.js の処理につなぐ
import * as E from '../../src/engine.js';
import { tick, demoAction } from '../../src/bots.js';

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

const routes = {
  // 状態の取得。v が今と同じなら中身は返さない（読み出しを減らすため）
  async 'GET state'({ env, url }) {
    let { g, p, gm } = await E.who(env, url.searchParams.get('k'));
    if (g.demo) { if (await tick(env, g)) g = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(g.id).first(); }
    if (String(g.ver) === url.searchParams.get('v')) return json({ v: g.ver, now: Date.now(), same: true });
    return json(gm ? await E.gmState(env, g) : await E.playerState(env, g, p));
  },
  async 'POST up'({ env, url, request }) {
    const { g, p, gm } = await E.who(env, url.searchParams.get('k'));
    if (gm) throw new E.Bad('GMは投稿できません');
    const ref = url.searchParams.get('ref');
    return json(await E.upload(env, g, p, url.searchParams.get('kind'), ref == null ? null : Number(ref), await request.arrayBuffer()));
  },
  async 'GET img'({ env, url }) {
    const { g, p, gm } = await E.who(env, url.searchParams.get('k'));
    const data = await E.photo(env, g, gm ? null : p, Number(url.searchParams.get('id')));
    return new Response(data instanceof ArrayBuffer ? data : new Uint8Array(data), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  },
  // 答えの写真：GMと、そのタームの内通者と、結果が出たあとの全員
  async 'GET answer'({ env, url, request }) {
    const { g, p, gm } = await E.who(env, url.searchParams.get('k'));
    const t = Number(url.searchParams.get('t')) || g.term;
    if (!gm) {
      const r = await env.DB.prepare('SELECT role FROM roles WHERE game = ? AND term = ? AND player = ?').bind(g.id, t, p.id).first();
      const done = t < g.term || (t === g.term && ['result', 'end'].includes(g.phase));
      if (!done && !(t === g.term && r?.role === '内通者' && g.phase !== 'setup')) throw new E.Bad('見られません', 403);
    }
    const T = E.termOf(t); if (!T) throw new E.Bad('ありません', 404);
    const res = await env.ASSETS.fetch(new URL('/_secret/' + T.photo, request.url));
    return new Response(res.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  },
  async 'POST act'({ env, request }) {
    const b = await request.json();
    const { g, p, gm } = await E.who(env, b.k);
    const A = gm ? {
      phase: () => E.phase(env, g, b.to),
      judge: () => E.judge(env, g, Number(b.sub), !!b.ok, b.note),
      contact: () => E.contact(env, g, b.role, Number(b.slot), b.player),
      kakuho: () => E.scoreKakuho(env, g, b.team, b.checks || []),
      clear: () => E.clearSabotage(env, g, Number(b.id)),
      role: () => E.editRole(env, g, Number(b.term), b.player, b.team, b.role),
      shuffle: () => E.reshuffle(env, g),
    } : {
      vote: () => E.vote(env, g, p, b),
      sabotage: () => E.sabotage(env, g, p),
      demoSkip: () => demoAction(env, g, p, 'demoSkip', b),
      demoContact: () => demoAction(env, g, p, 'demoContact', b),
    };
    if (!A[b.type]) throw new E.Bad('この操作はできません', 403);
    return json((await A[b.type]()) || {});
  },
  // 本番のゲームを作る（主催者の鍵が要る）
  async 'POST new'({ env, request }) {
    const b = await request.json();
    if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) throw new E.Bad('主催者の鍵が違います', 403);
    const { game } = await E.createGame(env, { title: b.title, names: String(b.names || '').split('\n') });
    return json({ gm: game.gm });
  },
  // デモ：16人のうち1人を自分、残りをコンピューターにする
  async 'POST demo'({ env }) {
    const old = await env.DB.prepare('SELECT id FROM games WHERE demo = 1 AND created < ?').bind(Date.now() - 86400000).all();
    for (const r of old.results) await E.deleteGame(env, r.id);
    // 無料の範囲を使い切られないように、1時間に作れるデモの数を絞る
    const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE demo = 1 AND created > ?').bind(Date.now() - 3600000).first();
    if (recent.n >= 60) throw new E.Bad('いまデモが混み合っています。しばらくしてからもう一度お試しください', 429);
    const names = ['アオサギ', 'イタチ', 'ウミネコ', 'オオカミ', 'カワセミ', 'キツネ', 'クジャク', 'コウモリ', 'サソリ', 'シャチ', 'タカ', 'ツバメ', 'ハヤブサ', 'フクロウ', 'ヤマネコ', 'ワシ'];
    const { game, players } = await E.createGame(env, { title: '台場スパイゲーム（デモ）', names, demo: true, me: 0, dur: { action: 12, meeting: 3, vote: 2 } });
    return json({ gm: game.gm, me: players[0].tok });
  },
};

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const key = `${request.method} ${(params.path || []).join('/')}`;
  const f = routes[key];
  if (!f) return json({ error: 'not found' }, 404);
  try { return await f({ env, url, request }); }
  catch (e) {
    if (e instanceof E.Bad) return json({ error: e.message }, e.status);
    console.error(e); return json({ error: 'サーバーでエラーが起きました' }, 500);
  }
}
