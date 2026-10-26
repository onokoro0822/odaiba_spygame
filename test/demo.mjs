// デモのコンピューターが動くか：しばらく状態を読み続けて、投稿・判定・接触が起きるのを見る
const B = process.env.BASE || 'http://localhost:8790';
const secs = Number(process.argv[2] || 60);
const api = (m, p, b) => fetch(B + '/api/' + p, { method: m, headers: { 'content-type': 'application/json' }, body: b && JSON.stringify(b) }).then(r => r.json());
const demo = await api('POST', 'demo');
const st = k => api('GET', `state?k=${k}`);
let g = await st(demo.me);
console.log('最初', g.game.phase, g.game.term);
await api('POST', 'act', { k: demo.me, type: 'demoSkip' }); // 役職発表 → 行動
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) { await st(demo.me); await new Promise(z => setTimeout(z, 1500)); }
g = await st(demo.gm);
const c = s => g.subs.filter(x => x.state === s).length;
console.log('場面', g.game.phase, '投稿', g.subs.length, '判定待ち', c('pending'), '認めた', c('ok'), '却下', c('ng'), '先に獲得', c('late'));
console.log('獲得されたお題', g.odai.filter(o => o.state === 'taken').map(o => `${o.no}:${o.team}`).join(' '));
console.log('接触', g.contacts.flatMap(x => x.slots.flatMap(s => s.who.filter(w => w.done).map(w => `${x.role}${s.n}-${w.team}`))).join(' ') || 'まだ');
console.log('妨害', g.sabotage.map(z => `${z.team}:${z.state}`).join(' ') || 'なし');
const me = await st(demo.me);
console.log('自分', me.role, me.team, '届いた', me.inbox.length, '件');
// 最後まで飛ばす
for (let i = 0; i < 20; i++) { const r = await api('POST', 'act', { k: demo.me, type: 'demoSkip' }); if (r.error) { console.log('飛ばし終了:', r.error); break; } }
g = await st(demo.gm);
console.log('最後', g.game.phase, '合計の1位', g.res.totals[0]?.name, g.res.totals[0]?.sum, 'タームの結果', g.res.terms.length);
