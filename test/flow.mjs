// 手元のサーバー（npm run dev）に対して、1ターム分を最初から最後まで通してみる
import { readFileSync } from 'node:fs';
const B = process.env.BASE || 'http://localhost:8790';
const JPG = readFileSync(new URL('../public/_secret/term1.jpg', import.meta.url));
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok ' : '  NG ') + m); if (!c) fails++; };
async function api(method, path, body, raw) {
  const r = await fetch(B + '/api/' + path, { method, headers: raw ? { 'content-type': 'image/jpeg' } : { 'content-type': 'application/json' }, body: raw ? body : body && JSON.stringify(body) });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, d: ct.includes('json') ? await r.json() : await r.arrayBuffer() };
}
const st = k => api('GET', `state?k=${k}`).then(r => r.d);
const act = (k, type, x = {}) => api('POST', 'act', { k, type, ...x });
const up = (k, kind, ref) => api('POST', `up?k=${k}&kind=${kind}${ref != null ? '&ref=' + ref : ''}`, JPG, true);

const { d: demo } = await api('POST', 'demo');
const GM = demo.gm;
let g = await st(GM);
ok(g.players.length === 16 && g.game.phase === 'setup', 'デモのゲームができる（16人、準備中）');
ok((await act(GM, 'phase', { to: 'action' })).status === 400, '順番を飛ばして進められない');
// 予定：ターム1の行動開始を 11:40 にすると、内通者の1回目の接触は 11:48〜11:53
ok((await act(GM, 'plan', { date: '2026-11-03', start: { 1: '11:40', 2: '14:15', 3: '9:5x' } })).status === 400, '時刻の形が違うと断られる');
await act(GM, 'plan', { date: '2026-11-03', start: { 1: '11:40', 2: '14:15', 3: '16:20' } });
g = await st(GM);
const sch = g.schedule[0], cs1 = sch.contacts.find(x => x.role === '内通者' && x.n === 1);
const jst = ms => new Date(ms + 9 * 3600000).toISOString().slice(11, 16);
// デモは行動が短いので、接触の時刻も比例して縮む（本番の60分なら 11:48〜11:53）
const k = g.game.dur.action / 60, base = Date.parse('2026-11-03T11:40:00+09:00');
const want = m => base + Math.round(m * k * 60000);
ok(jst(sch.start) === '11:40' && cs1.from === want(8) && cs1.to === want(13), `予定から接触の時刻が決まる（${jst(cs1.from)}〜${jst(cs1.to)}）`);
ok(jst(g.schedule[2].start) === '16:20' && g.game.plan.start[3] === '16:20', 'ターム3の予定も入る');
await act(GM, 'phase', { to: 'brief' }); await act(GM, 'phase', { to: 'action' });
g = await st(GM);
const R = g.roles[1], tok = Object.fromEntries(g.players.map(p => [p.id, p.tok])), nm = Object.fromEntries(g.players.map(p => [p.id, p.name]));
const who = (team, role) => Object.values(R).filter(r => r.team === team && r.role === role).map(r => r.player);
ok(g.odai.filter(o => o.state === 'open').length === 3, 'お題が3つ公開される');
const a1 = who('A', '公安')[0], b1 = who('B', '公安')[0], c1 = who('C', '公安')[0];

// お題1をAが獲得 → 手掛かりが届く
let r = await up(tok[a1], 'odai', 1); ok(r.status === 200, 'お題の写真を投稿できる');
ok((await up(tok[a1], 'odai', 1)).status === 400, '同じお題を判定待ちのまま二重に出せない');
ok((await up(tok[a1], 'odai', 9)).status === 400, 'まだ出ていないお題には出せない');
g = await st(GM); let s1 = g.subs.find(s => s.player === a1);
await act(GM, 'judge', { sub: s1.id, ok: true });
let pa = await st(tok[a1]);
ok(pa.inbox.some(m => m.kind === 'reward' && m.title.startsWith('1番目')), '獲得した人に1番目の手掛かりが届く');
ok(pa.odai.filter(o => o.state === 'open').length === 3 && pa.odai.some(o => o.no === 4 && o.state === 'open'), '次のお題（4）が公開される');
let pb = await st(tok[b1]); ok(!pb.inbox.some(m => m.kind === 'reward'), '別のチームには手掛かりが届かない');

// お題2：Bが先、Cが後。Cを先に認めようとすると断られる
await up(tok[b1], 'odai', 2); await new Promise(z => setTimeout(z, 20)); await up(tok[c1], 'odai', 2);
g = await st(GM);
const sb = g.subs.find(s => s.player === b1 && s.ref === 2), sc = g.subs.find(s => s.player === c1 && s.ref === 2);
ok(sc.earlier === true, 'GM画面で、先に投稿があることが分かる');
ok((await act(GM, 'judge', { sub: sc.id, ok: true })).status === 400, '後から投稿した方を先に認められない');
await act(GM, 'judge', { sub: sb.id, ok: false, note: '看板が写っていない' });
ok((await st(tok[b1])).inbox.some(m => m.kind === 'ng' && m.body.includes('看板が写っていない')), '却下の理由が届く');
await act(GM, 'judge', { sub: sc.id, ok: true });
ok((await st(tok[c1])).inbox.some(m => m.title.startsWith('2番目')), '却下のあとは次の投稿が認められ、2番目が届く');

// 接触と妨害
const sA = who('A', '内通者')[0], bA = who('A', '密使')[0], tA = who('A', '蜃気楼')[0];
ok((await act(GM, 'contact', { role: '内通者', slot: 1, player: bA })).status === 400, '役職の違う人は接触の対象にできない');
await act(GM, 'contact', { role: '内通者', slot: 1, player: sA });
let ps = await st(tok[sA]); ok(ps.rights === 1 && ps.contact.slots[0].done, '内通者の接触で妨害の権利が1つ');
ok(ps.answer && (await api('GET', `answer?k=${tok[sA]}`)).status === 200, '内通者は答えの写真を見られる');
ok(ps.contact.slots[0].from === want(8), '内通者のページにも予定の時刻で出る（実際に始めた時刻ではなく）');
ok((await api('GET', `answer?k=${tok[a1]}`)).status === 403, '公安は答えの写真を見られない');
await act(GM, 'contact', { role: '密使', slot: 1, player: bA });
const pbA = await st(tok[bA]); ok(pbA.inbox.some(m => m.kind === 'contact' && who('A', '公安').some(id => m.body.includes(nm[id]))), '密使に自分のチームの公安の名前が届く');
ok(pbA.bep.length === 3, '密使に3つの項目が出る');
await act(GM, 'contact', { role: '蜃気楼', slot: 1, player: tA });
ok((await st(tok[tA])).inbox.some(m => m.body.includes(nm[sA])), '蜃気楼の1回目で内通者の名前が届く');
r = await act(tok[sA], 'sabotage'); ok(r.status === 200, '内通者が妨害を発動できる');
ok((await act(tok[sA], 'sabotage')).status === 400, '権利がなければ発動できない');
pb = await st(tok[b1]); ok(pb.sabotage.length === 1 && pb.inbox.some(m => m.kind === 'alert'), '全員に緊急任務が知らされる');
ok((await up(tok[b1], 'odai', 2 + 2)).status === 400, '緊急任務のあいだは別のチームもお題を出せない');
ok((await up(tok[b1], 'kinkyu', pb.sabotage[0].id)).status === 400, '別のチームは緊急任務の写真を出せない');
await up(tok[a1], 'kinkyu', pb.sabotage[0].id);
g = await st(GM); await act(GM, 'judge', { sub: g.subs.find(s => s.kind === 'kinkyu').id, ok: true });
ok((await st(tok[b1])).sabotage.length === 0, '緊急任務の写真が認められると解除される');

// 張り込み
ps = await st(tok[sA]); const h = ps.harikomi.find(x => x.team === 'A');
ok(ps.harikomi.length === 15, '張り込みが3チーム×5つ');
await up(tok[sA], 'harikomi', h.id); g = await st(GM);
await act(GM, 'judge', { sub: g.subs.find(s => s.kind === 'harikomi').id, ok: true });
// 本番ではデモのコンピューターが途中で権利を使うことがあるので、届いた知らせで確かめる
ok((await st(tok[sA])).inbox.some(m => m.kind === 'right' && m.title.startsWith('張り込み成功')), '張り込み成功で、そのチームの内通者に権利が増える');

// 写真の見え方
const photoId = g.subs.find(s => s.player === a1 && s.kind === 'odai').photo;
ok((await api('GET', `img?k=${tok[who('A', '公安')[1]]}&id=${photoId}`)).status === 200, '同じチームの写真は見られる');
ok((await api('GET', `img?k=${tok[b1]}&id=${photoId}`)).status === 403, '別のチームの写真は見られない');
ok((await api('GET', '../_secret/term1.jpg').catch(() => ({ status: 404 }))).status === 404 && (await fetch(B + '/_secret/term1.jpg')).status === 404, '答えの写真を直接は開けない');

// 確保 → 会議 → 投票 → 結果
await up(tok[a1], 'kakuho'); ok((await up(tok[who('A', '公安')[1]], 'kakuho')).status === 400, '確保写真はチームで1回だけ');
await up(tok[b1], 'kakuho');
await act(GM, 'phase', { to: 'meeting' });
ok((await up(tok[c1], 'odai', 3)).status === 400, '行動が終わったら投稿できない');
for (const [pid, r0] of Object.entries(R)) {
  if (!r0.role) continue;
  const M = Object.values(R).filter(x => x.team === r0.team && x.role);
  const pick = role => M.find(x => x.role === role).player;
  await act(tok[pid], 'vote', { s: pick('内通者'), b: pick('密使'), t: pick('蜃気楼') });
}
ok((await act(tok[a1], 'vote', { s: c1 })).status === 400, '別のチームの人には投票できない');
await act(GM, 'phase', { to: 'vote' });
ok((await act(GM, 'phase', { to: 'result' })).status === 400, '確保写真の採点が終わるまで結果に進めない');
await act(GM, 'kakuho', { team: 'A', checks: [1, 2, 3, 4] }); await act(GM, 'kakuho', { team: 'B', checks: [1] });
r = await act(GM, 'phase', { to: 'result' }); ok(r.status === 200, '採点すると結果に進める');
pa = await st(tok[a1]);
const T1 = pa.res.terms[0];
ok(T1 && T1.teams.find(x => x.team === 'A').kakuho === 4 && T1.teams.find(x => x.team === 'A').top, 'Aチームの確保点4でトップ賞');
// 全員が正解を書いたので、内通者も密使を当てている → 公安は −5
ok(T1.players.find(p => p.id === a1).pt === 4 + 8 + 5 + 4 + 3 - 5, `全問正解の公安の点（4+8+5+4+3−5=19）→ ${T1.players.find(p => p.id === a1).pt}`);
ok((await api('GET', `img?k=${tok[b1]}&id=${photoId}`)).status === 200, '結果が出たら別のチームの写真も見られる');
await act(GM, 'phase', { to: 'brief' }); g = await st(GM);
ok(g.game.term === 2 && g.odai.every(o => o.state === 'wait'), 'ターム2に進める');
const pv = await st(tok[a1]); r = await st(tok[a1]).then(() => api('GET', `state?k=${tok[a1]}&v=${pv.v}`));
ok(r.d.same === true, '変わっていなければ中身を返さない');
console.log(fails ? `${fails}件 NG` : 'すべて ok'); process.exit(fails ? 1 : 0);
