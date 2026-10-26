// 「やってみる」デモ（GM・参加者）を、課題の順に最後まで進められるか
const B = process.env.BASE || 'http://localhost:8790';
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok ' : '  NG ') + m); if (!c) fails++; };
const api = (m, p, b, raw) => fetch(B + '/api/' + p, { method: m, headers: raw ? {} : { 'content-type': 'application/json' }, body: raw || (b && JSON.stringify(b)) }).then(async r => ({ status: r.status, d: await r.json() }));
const wait = ms => new Promise(z => setTimeout(z, ms));
const JPG = new Uint8Array([255, 216, 255, 217]);
async function until(f, ms, step = 4200) { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await wait(step); } return null; }

console.log('GM・やってみる');
let { d } = await api('POST', 'demo', { mode: 'try-gm' });
const K = d.gm, st = () => api('GET', `state?k=${K}`).then(r => r.d), act = (type, x = {}) => api('POST', 'act', { k: K, type, ...x });
await act('phase', { to: 'brief' }); await act('phase', { to: 'action' });
let g = await st();
ok(g.subs.filter(s => s.state === 'pending').length >= 2, '行動を始めるとすぐ写真が2枚届く');
const [a, b] = g.subs.filter(s => s.state === 'pending' && !s.earlier);
await act('judge', { sub: a.id, ok: true }); await act('judge', { sub: b.id, ok: false, note: '条件が写っていない' });
const slot = g.contacts[0].slots[0]; await act('contact', { role: g.contacts[0].role, slot: slot.n, player: slot.who[0].id });
g = await until(async () => { const s = await st(); return s.sabotage.length ? s : null; }, 20000);
ok(!!g, '2枚判定すると緊急任務が出る');
g = await until(async () => { const s = await st(); return s.subs.some(x => x.kind === 'kinkyu' && x.state === 'pending') ? s : null; }, 90000);
ok(!!g, 'コンピューターが緊急任務の写真を出す');
if (g) await act('judge', { sub: g.subs.find(x => x.kind === 'kinkyu' && x.state === 'pending').id, ok: true });
g = await st(); ok(g.sabotage.some(z => z.state === 'cleared'), '緊急任務を解除できる');
await act('phase', { to: 'meeting' }); g = await st();
for (const k of g.kakuho) if (k.sub) await act('kakuho', { team: k.team, checks: [1, 2] });
await act('phase', { to: 'vote' }); const r = await act('phase', { to: 'result' });
ok(r.status === 200, `結果まで進める ${r.d.error || ''}`);

console.log('参加者・やってみる');
({ d } = await api('POST', 'demo', { mode: 'try-player' }));
const P = d.me, ps = () => api('GET', `state?k=${P}`).then(r => r.d), pact = (type, x = {}) => api('POST', 'act', { k: P, type, ...x });
await pact('demoSkip'); await pact('demoSkip');
let s = await ps();
ok(s.role === '内通者' && s.game.phase === 'action', 'やってみるでは内通者になる');
ok((await api('POST', `up?k=${P}&kind=odai&ref=1`, null, JPG)).status === 200, 'お題の写真を出せる');
s = await until(async () => { const x = await ps(); return x.inbox.some(m => m.kind === 'reward') ? x : null; }, 30000);
ok(!!s, 'コンピューターのGMが判定して、手掛かりが届く');
ok((await pact('demoContact', { slot: 1 })).status === 200, '時間に関係なく接触できる');
ok((await pact('sabotage')).status === 200, '妨害を発動できる');
s = await ps();
ok((await api('POST', `up?k=${P}&kind=kinkyu&ref=${s.sabotage.find(z => z.team === s.team).id}`, null, JPG)).status === 200, '緊急任務の写真を出せる');
ok((await api('POST', `up?k=${P}&kind=kakuho`, null, JPG)).status === 200, '確保写真を出せる');
await pact('demoSkip'); s = await ps();
const mates = s.mates.map(m => m.id);
ok((await pact('vote', { b: mates[1], t: mates[2] })).status === 200, '投票できる');
await pact('demoSkip'); await pact('demoSkip'); s = await ps();
ok(s.game.phase === 'result' && s.res.terms[0], '結果が出る');
console.log(fails ? `${fails}件 NG` : 'すべて ok'); process.exit(fails ? 1 : 0);
