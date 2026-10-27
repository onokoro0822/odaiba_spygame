// API の入口。/api/<名前> を engine.js の処理につなぐ
import * as E from '../../src/engine.js';
import { cleanScenario } from '../../src/scenario.js';
import { tick, demoAction, catchUp, gmMode, seed } from '../../src/bots.js';

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// シナリオの写真を読む。'db:<id>' は編集画面から上げたもの（データベース）、それ以外は public/_secret/ の下のファイル
async function scenPhoto(env, request, ref) {
  if (!ref || ref.includes('..')) return null;
  if (ref.startsWith('db:')) {
    const r = await env.DB.prepare("SELECT data FROM photos WHERE id = ? AND game = 'scen'").bind(Number(ref.slice(3))).first();
    return r ? (r.data instanceof ArrayBuffer ? r.data : new Uint8Array(r.data)) : null;
  }
  const res = await env.ASSETS.fetch(new URL('/_secret/' + ref, request.url));
  // 無いファイルを頼むとトップページが返ってくるので、画像のときだけ使う
  return res.ok && (res.headers.get('content-type') || '').startsWith('image/') ? res.body : null;
}
const jpeg = body => new Response(body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });

const routes = {
  // 状態の取得。v が今と同じなら中身は返さない（読み出しを減らすため）
  async 'GET state'({ env, url }) {
    let { g, p, gm, gmNow } = await E.who(env, url.searchParams.get('k'));
    // as=gm：GM手帳から。主催者の鍵か、このタームのGMを任された参加者の鍵
    const asGm = gm || (url.searchParams.get('as') === 'gm' && gmNow);
    if (url.searchParams.get('as') === 'gm' && !asGm) throw new E.Bad('このタームのGMではありません', 403);
    if (g.demo) { if (await tick(env, g)) g = await E.attach(env, await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(g.id).first()); }
    if (String(g.ver) === url.searchParams.get('v')) return json({ v: g.ver, now: Date.now(), same: true });
    return json(asGm ? await E.gmState(env, g, gm ? null : p) : await E.playerState(env, g, p));
  },
  async 'POST up'({ env, url, request }) {
    const { g, p, gm } = await E.who(env, url.searchParams.get('k'));
    if (gm) throw new E.Bad('GMは投稿できません');
    const ref = url.searchParams.get('ref');
    return json(await E.upload(env, g, p, url.searchParams.get('kind'), ref == null ? null : Number(ref), await request.arrayBuffer()));
  },
  async 'GET img'({ env, url }) {
    const { g, p, gm, gmNow } = await E.who(env, url.searchParams.get('k'));
    const data = await E.photo(env, g, gm || gmNow ? null : p, Number(url.searchParams.get('id')));
    return new Response(data instanceof ArrayBuffer ? data : new Uint8Array(data), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  },
  // 答えの写真：GMと、そのタームの内通者と、結果が出たあとの全員
  async 'GET answer'({ env, url, request }) {
    const { g, p, gm, gmNow } = await E.who(env, url.searchParams.get('k'));
    const t = Number(url.searchParams.get('t')) || g.term;
    if (!gm && !(gmNow && t === g.term)) {
      const r = await env.DB.prepare('SELECT role FROM roles WHERE game = ? AND term = ? AND player = ?').bind(g.id, t, p.id).first();
      const done = t < g.term || (t === g.term && ['result', 'end'].includes(g.phase));
      if (!done && !(t === g.term && r?.role === '内通者' && g.phase !== 'setup')) throw new E.Bad('見られません', 403);
    }
    const T = E.termOf(g, t); if (!T) throw new E.Bad('ありません', 404);
    const body = await scenPhoto(env, request, T.photo);
    if (!body) throw new E.Bad('答えの写真がありません', 404);
    return jpeg(body);
  },
  // お題の見本写真（下見のときに撮ったもの）。GMだけが見られる
  async 'GET sample'({ env, url, request }) {
    const { g, gm, gmNow } = await E.who(env, url.searchParams.get('k'));
    if (!gm && !gmNow) throw new E.Bad('見られません', 403);
    const o = E.termOf(g, Number(url.searchParams.get('t')) || g.term)?.odai.find(x => x.no === Number(url.searchParams.get('no')));
    // デモでは本物の下見写真は出さず、作り物の写真（scripts/gen_demo_photos.py）を使う
    const ref = g.demo ? o?.demo && 'demo/' + o.demo : o?.sample && (o.sample.startsWith('db:') ? o.sample : 'sample/' + o.sample);
    const body = await scenPhoto(env, request, ref);
    if (!body) throw new E.Bad('見本の写真はありません', 404);
    return jpeg(body);
  },
  async 'POST act'({ env, request }) {
    const b = await request.json();
    const { g, p, gm, gmNow } = await E.who(env, b.k);
    const asGm = gm || (b.as === 'gm' && gmNow);
    // 役職の割り振りは主催者だけ（GMを任された参加者が、これからの役職を見たり変えたりしないように）
    const ownerOnly = ['role', 'shuffle'];
    if (asGm && !gm && ownerOnly.includes(b.type)) throw new E.Bad('役職の割り振りは主催者のGM手帳からだけできます', 403);
    const A = asGm ? {
      // GMデモでは、進める前にコンピューターの確保写真と投票を済ませる
      phase: async () => { if (g.demo && gmMode(g)) await catchUp(env, g, b.to); await E.phase(env, g, b.to); if (g.demo) await seed(env, g.id); },
      demoShift: () => demoAction(env, g, null, 'demoShift', b),
      judge: () => E.judge(env, g, Number(b.sub), !!b.ok, b.note),
      contact: () => E.contact(env, g, b.role, Number(b.slot), b.player),
      kakuho: () => E.scoreKakuho(env, g, b.team, b.checks || []),
      clear: () => E.clearSabotage(env, g, Number(b.id)),
      role: () => E.editRole(env, g, Number(b.term), b.player, b.team, b.role),
      shuffle: () => E.reshuffle(env, g),
      plan: () => E.setPlan(env, g, b.date, b.start),
    } : {
      vote: () => E.vote(env, g, p, b),
      sabotage: () => E.sabotage(env, g, p),
      demoSkip: () => demoAction(env, g, p, 'demoSkip', b),
      demoContact: () => demoAction(env, g, p, 'demoContact', b),
    };
    if (!A[b.type]) throw new E.Bad('この操作はできません', 403);
    return json((await A[b.type]()) || {});
  },
  // シナリオの編集（主催者の鍵が要る）。保存すると、そのあとに作るゲームとデモから使われる
  async 'POST scenario'({ env, request }) {
    const b = await request.json();
    if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) throw new E.Bad('主催者の鍵が違います', 403);
    if (b.op === 'get') { const m = await E.mainScenario(env); return json({ ...m, edited: m.updated != null }); }
    if (b.op === 'reset') { await env.DB.prepare("DELETE FROM scen WHERE id = 'main'").run(); return json({ ok: true }); }   // 'base'（10/04）に戻る
    // 写真を見る（編集画面のサムネイル用）
    if (b.op === 'photo') { const body = await scenPhoto(env, request, b.ref); if (!body) throw new E.Bad('写真がありません', 404); return jpeg(body); }
    if (b.op === 'save') {
      let data;
      try { data = cleanScenario(b.data, E.DEFAULT); } catch (e) { throw new E.Bad(e.message); }
      const t = Date.now();
      await env.DB.prepare("INSERT OR REPLACE INTO scen (id, title, data, updated) VALUES ('main', ?, ?, ?)").bind(data.title, JSON.stringify(data), t).run();
      return json({ ok: true, updated: t, data });
    }
    throw new E.Bad('この操作はできません');
  },
  // シナリオの写真を上げる（答えの写真・見本写真）。データベースに置き、'db:<id>' を返す
  async 'POST scenario-photo'({ env, url, request }) {
    if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) throw new E.Bad('主催者の鍵が違います', 403);
    const data = await request.arrayBuffer();
    if (!data.byteLength || data.byteLength > 1_900_000) throw new E.Bad('写真が大きすぎます');
    const r = await env.DB.prepare("INSERT INTO photos (game, data) VALUES ('scen', ?)").bind(data).run();
    return json({ ref: 'db:' + r.meta.last_row_id });
  },
  // 本番のゲームを作る（主催者の鍵が要る）
  async 'POST new'({ env, request }) {
    const b = await request.json();
    if (!env.ADMIN_KEY || b.key !== env.ADMIN_KEY) throw new E.Bad('主催者の鍵が違います', 403);
    const { game } = await E.createGame(env, { title: b.title, names: String(b.names || '').split('\n') });
    return json({ gm: game.gm });
  },
  // デモ：16人のうち1人を自分、残りをコンピューターにする
  async 'POST demo'({ env, request }) {
    const want = (await request.json().catch(() => ({}))).mode;
    const mode = ['player', 'gm', 'tour-player', 'tour-gm', 'try-player', 'try-gm'].includes(want) ? want : 'player';
    const old = await env.DB.prepare('SELECT id FROM games WHERE demo = 1 AND created < ?').bind(Date.now() - 86400000).all();
    for (const r of old.results) await E.deleteGame(env, r.id);
    // 無料の範囲（D1の読み出し 1日500万行）を使い切らないように、デモの数を絞る。
    // 測ると、デモ1回（約20分）で7万行ほど読む。本番のゲーム（16人・3ターム）は1日150万行ほど。
    // 本番のゲームが進行中なら、そちらの分を残すためにさらに絞る
    const day = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE demo = 1 AND created > ?').bind(Date.now() - 86400000).first();
    const live = await env.DB.prepare("SELECT COUNT(*) AS n FROM games WHERE demo = 0 AND phase NOT IN ('setup', 'end') AND created > ?").bind(Date.now() - 2 * 86400000).first();
    if (day.n >= (live.n ? 15 : 45)) throw new E.Bad('今日のデモは満員になりました。明日またお試しください', 429);
    const names = ['アオサギ', 'イタチ', 'ウミネコ', 'オオカミ', 'カワセミ', 'キツネ', 'クジャク', 'コウモリ', 'サソリ', 'シャチ', 'タカ', 'ツバメ', 'ハヤブサ', 'フクロウ', 'ヤマネコ', 'ワシ'];
    // 参加者デモは短く。GMデモは本番と同じ長さで、行動中は時間を飛ばしながら進める
    const asGm = mode === 'gm' || mode.endsWith('-gm');
    const title = { player: 'デモ', gm: 'GMデモ', 'tour-player': '参加者・画面の案内', 'tour-gm': 'GM・画面の案内', 'try-player': '参加者・やってみる', 'try-gm': 'GM・やってみる' }[mode];
    const { game, players } = asGm
      ? await E.createGame(env, { title: `台場スパイゲーム（${title}）`, names, demo: true, me: -1, mode })
      : await E.createGame(env, { title: `台場スパイゲーム（${title}）`, names, demo: true, me: 0, mode, meRole: mode === 'player' ? null : '内通者', dur: mode === 'player' ? { action: 12, meeting: 3, vote: 2 } : undefined });
    return json({ gm: game.gm, me: asGm ? null : players[0].tok, mode });
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
