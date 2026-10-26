// 10/04 の実際の投票と確保点から、アーカイブの点数がそのまま出るかを確かめる
import { readFileSync } from 'node:fs';
import { scoreTerm } from '../src/scoring.js';
const D = JSON.parse(readFileSync(new URL('../public/archive/data.json', import.meta.url)));
let bad = 0, n = 0;
for (const t of [1, 2, 3]) {
  const S = D.scores.filter(s => s.t === t);
  const members = S.map(s => ({ id: s.name, team: s.team, role: s.role, vote: s.vote }));
  const teams = Object.fromEntries(D.teams.filter(x => x.t === t).map(x => [x.team, x]));
  const r = scoreTerm(members, teams);
  for (const s of S) { n++; if (r[s.name].pt !== s.pt) { bad++; console.log('ずれ', t, s.team, s.role, s.name, '期待', s.pt, '計算', r[s.name].pt); } }
  for (const x of D.teams.filter(x => x.t === t)) if (r[S.find(s => s.team === x.team).name].top !== x.top) { bad++; console.log('トップ賞ずれ', t, x.team); }
}
console.log(`${n}人分のうち ずれ ${bad}`); process.exit(bad ? 1 : 0);
