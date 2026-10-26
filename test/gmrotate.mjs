// タームごとにGMが入れ替わる・1タームにGMが複数いる・参加回数が少ない人の補正
// 本番のゲームを作るので主催者の鍵が要る：ADMIN_KEY=... node test/gmrotate.mjs
const B = process.env.BASE || 'http://localhost:8790', KEY = process.env.ADMIN_KEY;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok ' : '  NG ') + m); if (!c) fails++; };
const api = (m, p, b) => fetch(B + '/api/' + p, { method: m, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b) }).then(async r => ({ status: r.status, d: await r.json() }));
const names = 'アオサギ イタチ ウミネコ オオカミ カワセミ キツネ クジャク コウモリ サソリ シャチ タカ ツバメ ハヤブサ フクロウ ヤマネコ ワシ'.split(' ');
const { d: made } = await api('POST', 'new', { key: KEY, names: names.join('\n') });
const GM = made.gm; ok(!!GM, 'ゲームを作れる');
const st = (k, gm) => api('GET', `state?k=${k}${gm ? '&as=gm' : ''}`).then(r => r), act = (k, type, x = {}, gm = true) => api('POST', 'act', { k, type, ...(gm ? { as: 'gm' } : {}), ...x });
let g = (await st(GM)).d;
const P = g.players, tok = Object.fromEntries(P.map(p => [p.id, p.tok]));
const [x, y, z] = [P[0], P[1], P[2]];
// ターム1：アオサギとイタチがGM、ターム2：ウミネコがGM
await act(GM, 'role', { term: 1, player: x.id, role: 'GM' }); await act(GM, 'role', { term: 1, player: y.id, role: 'GM' }); await act(GM, 'role', { term: 2, player: z.id, role: 'GM' });
await act(GM, 'shuffle');
g = (await st(GM)).d;
ok(g.roles[1][x.id].role === 'GM' && g.roles[1][y.id].role === 'GM' && g.roles[2][z.id].role === 'GM', '割り振り直しても、GMに決めた人はそのまま');
const t1 = Object.values(g.roles[1]).filter(r => r.role !== 'GM');
ok(t1.length === 14 && ['A', 'B', 'C'].every(tm => ['内通者', '密使', '蜃気楼'].every(r => t1.filter(q => q.team === tm && q.role === r).length === 1)), '残りの14人で、各チームに特殊役職が1人ずつ');
ok((await st(tok[x.id], true)).status === 403, '始まる前は、GMの人もまだGM手帳を開けない');
await act(GM, 'phase', { to: 'brief' });
let gx = await st(tok[x.id], true);
ok(gx.status === 200 && gx.d.by?.id === x.id, 'ターム1のGM（アオサギ）は、自分のURLでGM手帳を開ける');
ok(gx.d.players.every(p => p.tok === null) && !gx.d.roles[2] && !gx.d.roles[3], 'GMを任された人には、ほかの人のURLとこれからのタームの役職は見せない');
ok((await st(tok[y.id], true)).status === 200, '2人目のGM（イタチ）も開ける');
ok((await st(tok[z.id], true)).status === 403, 'ターム2のGM（ウミネコ）は、ターム1では開けない');
const px = (await st(tok[x.id])).d; ok(px.gmNow === true && !px.role, 'GMの人の個人ページは「このタームはGMです」');
ok((await act(tok[x.id], 'role', { term: 2, player: x.id, role: '公安', team: 'A' })).status === 403, 'GMを任された人は役職の割り振りを変えられない');
ok((await act(tok[x.id], 'phase', { to: 'action' })).status === 200, 'GMを任された人が場面を進められる');
const pl = Object.values(g.roles[1]).find(r => r.role === '公安');
const jpg = await (await fetch(B + '/_secret/term1.jpg').catch(() => null))?.arrayBuffer?.();
const up = await fetch(`${B}/api/up?k=${tok[pl.player]}&kind=odai&ref=1`, { method: 'POST', body: new Uint8Array([255, 216, 255, 217]) });
ok(up.status === 200, '参加者が投稿できる');
gx = await st(tok[y.id], true);
const sub = gx.d.subs.find(s => s.kind === 'odai');
ok((await act(tok[y.id], 'judge', { sub: sub.id, ok: true })).status === 200, 'もう1人のGMが判定できる');
ok((await act(tok[x.id], 'judge', { sub: sub.id, ok: true })).status === 400, '同じ投稿を2人目が判定しようとしても、二重にはならない');
// 3ターム進める（確保なし＝0点、投票なし）
for (let t = 1; t <= 3; t++) {
  if (t > 1) { await act(GM, 'phase', { to: 'brief' }); await act(GM, 'phase', { to: 'action' }); }
  for (const to of ['meeting', 'vote', 'result']) await act(GM, 'phase', { to });
}
await act(GM, 'phase', { to: 'end' });
g = (await st(GM)).d;
const T = Object.fromEntries(g.res.totals.map(r => [r.id, r]));
ok(T[x.id].by[1] === 'GM' && T[x.id].played === 2 && T[x.id].rate === 1.5 && T[x.id].adj === Math.round(T[x.id].sum * 1.5 * 10) / 10, `ターム1がGMの人は2ターム分を1.5倍（${T[x.id].sum} → ${T[x.id].adj}）`);
ok(T[z.id].by[2] === 'GM' && T[z.id].rate === 1.5, 'ターム2がGMの人も1.5倍');
ok(T[P[5].id].rate === 1, '3ターム参加した人はそのまま');
ok(g.res.scaled === true && g.res.totals.every((r, i, a) => i === 0 || a[i - 1].adj >= r.adj), '順位は補正後の点で並ぶ');
console.log(fails ? `${fails}件 NG` : 'すべて ok'); process.exit(fails ? 1 : 0);
