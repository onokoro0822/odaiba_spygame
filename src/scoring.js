// 1タームの得点計算。ルールの得点表をそのままコードにしたもの。
// members: [{id, team, role, vote:{s,b,t}}]  vote の値は相手の id（内通者・密使・蜃気楼だと思う人）
// teams:   {A:{kakuho, bep3, bougai}, ...}   kakuho=確保点 bep3=密使の3項目が入った数 bougai=妨害の回数
export const ROLES = ['公安', '内通者', '密使', '蜃気楼'];
const KEY = { 内通者: 's', 密使: 'b', 蜃気楼: 't' };

export function scoreTerm(members, teams, sabotageMax = 4) {
  const best = Math.max(...Object.values(teams).map(x => x.kakuho ?? 0));
  const out = {};
  for (const tm of Object.keys(teams)) {
    const M = members.filter(m => m.team === tm);
    const holder = r => M.find(m => m.role === r);
    const S = holder('内通者'), B = holder('密使'), T = holder('蜃気楼');
    // 自分の役職の欄は自分の名前を書くので、当たりには数えない
    const hit = (m, r) => { const h = holder(r); return !!h && h.id !== m.id && m.vote?.[KEY[r]] === h.id; };
    const { kakuho = 0, bep3 = 0, bougai = 0 } = teams[tm];
    const top = best > 0 && kakuho === best; // 全チーム0点のときはトップ賞なし
    const sHitsB = S ? hit(S, '密使') : false;
    for (const m of M) {
      let p = 0;
      if (m.role === '公安') {
        p = kakuho + (top ? 8 : 0) + (hit(m, '内通者') ? 5 : 0) + (hit(m, '密使') ? 4 : 0) + (hit(m, '蜃気楼') ? 3 : 0) - (sHitsB ? 5 : 0);
      } else if (m.role === '密使') {
        p = kakuho + (top ? 3 : 0) + bep3 * 2 + (hit(m, '内通者') ? 5 : 0) + (hit(m, '蜃気楼') ? 6 : 0) - (T && hit(T, '密使') ? 2 : 0);
        if (sHitsB) p = Math.floor(p / 2);
      } else if (m.role === '蜃気楼') {
        const others = M.filter(x => x.role === '公安' || x.role === '密使');
        p = others.filter(x => !hit(x, '内通者')).length * 2
          + M.filter(x => x.id !== m.id && x.vote?.s === m.id).length * 2
          + Math.min(bougai, sabotageMax) * 3
          + (hit(m, '密使') ? 6 : 0) + (sHitsB ? 6 : 0)
          - M.filter(x => hit(x, '蜃気楼')).length * 3
          - (B && hit(B, '蜃気楼') ? 5 : 0);
      } else if (m.role === '内通者') {
        p = (20 - kakuho) * 2 + M.filter(x => x.role !== '蜃気楼' && x.id !== m.id && !hit(x, '内通者')).length * 3 + (sHitsB ? 8 : 0);
      }
      out[m.id] = { pt: p, top };
    }
  }
  return out;
}
