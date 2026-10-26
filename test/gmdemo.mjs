// GMデモ：16人ともコンピューターで、GMが最後まで進められるか
const B = process.env.BASE || 'http://localhost:8790';
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok ' : '  NG ') + m); if (!c) fails++; };
const api = (m, p, b) => fetch(B + '/api/' + p, { method: m, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b) }).then(async r => ({ status: r.status, d: await r.json() }));
const wait = ms => new Promise(z => setTimeout(z, ms));
const { d } = await api('POST', 'demo', { mode: 'gm' });
const GM = d.gm, st = () => api('GET', `state?k=${GM}`).then(r => r.d), act = (type, x = {}) => api('POST', 'act', { k: GM, type, ...x });
ok(d.me === null && GM, 'GMデモができる（自分は参加者ではない）');
let g = await st();
ok(g.players.every(p => p.bot) && g.game.mode === 'gm' && g.game.dur.action === 60, '16人ともコンピューター、行動は60分');
await wait(4500); g = await st();
ok(g.game.phase === 'setup', 'GMデモは勝手に始まらない');
await act('phase', { to: 'brief' }); await act('phase', { to: 'action' });
ok((await act('demoShift', { to: 'contact' })).status === 200, '次の接触まで時間を進められる');
for (let i = 0; i < 6; i++) { await st(); await wait(4200); }
g = await st();
const pend = g.subs.filter(s => s.state === 'pending');
ok(g.subs.length > 0, `コンピューターが写真を出す（${g.subs.length}件）`);
ok(pend.length === g.subs.filter(s => s.kind !== 'kakuho').length, 'GMデモでは判定はGMがする（勝手に判定されない）');
const slot = g.contacts.flatMap(c => c.slots.map(x => ({ ...x, role: c.role }))).find(x => x.from <= g.now && x.to >= g.now);
ok(!!slot, 'いまの接触の枠に入っている');
ok(g.contacts.every(c => c.slots.every(x => x.who.every(w => !w.done))), 'GMデモでは接触も勝手に成功しない');
if (slot) { const r = await act('contact', { role: slot.role, slot: slot.n, player: slot.who[0].id }); ok(r.status === 200, 'GMが接触を押せる'); }
if (pend[0]) ok((await act('judge', { sub: pend.find(s => !s.earlier).id, ok: true })).status === 200, 'GMが判定できる');
ok((await act('demoShift', { to: 'end' })).status === 200, '行動の終わりまで進められる');
await act('phase', { to: 'meeting' });
g = await st();
ok(g.kakuho.every(k => k.sub), '行動を終えると、3チームとも確保写真が出ている');
for (const k of g.kakuho) await act('kakuho', { team: k.team, checks: [1, 2, 3] });
await act('phase', { to: 'vote' });
const r = await act('phase', { to: 'result' });
g = await st();
ok(r.status === 200 && g.game.phase === 'result' && g.res.terms[0].players.every(p => p.voted), '結果に進むと、コンピューター全員が投票している');
console.log(fails ? `${fails}件 NG` : 'すべて ok'); process.exit(fails ? 1 : 0);
