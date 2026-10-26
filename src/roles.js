// チーム分けと役職の割り振り。
// 3チームに分け、各チームに内通者・密使・蜃気楼を1人ずつ、残りは公安。
// 何回か試して、同じ人が同じ特殊役職を続けて引かないもの、特殊役職が偏らないものを選ぶ。
export const TEAMS = ['A', 'B', 'C'];
export const SPECIAL = ['内通者', '密使', '蜃気楼'];

function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ids: そのタームに参加する人。history: {id: [役職, ...]}（前のタームまで）
export function assignTerm(ids, history = {}, rnd = Math.random, tries = 300) {
  let best = null, bestCost = Infinity;
  for (let k = 0; k < tries; k++) {
    const order = shuffle(ids, rnd);
    const out = {};
    order.forEach((id, i) => { out[id] = { team: TEAMS[i % 3], role: null }; });
    for (const tm of TEAMS) {
      const M = shuffle(order.filter(id => out[id].team === tm), rnd);
      M.forEach((id, i) => { out[id].role = SPECIAL[i] ?? '公安'; });
    }
    let cost = 0;
    for (const id of ids) {
      const h = history[id] || [], r = out[id].role;
      if (r !== '公安' && h.includes(r)) cost += 10;
      if (r !== '公安') cost += h.filter(x => x !== '公安').length * 2;
      if (r === '公安' && h.length && h.every(x => x === '公安')) cost += 3;
    }
    if (cost < bestCost) { bestCost = cost; best = out; }
  }
  return best;
}

export function assignAll(ids, terms = 3, rnd = Math.random) {
  const history = {}, res = [];
  for (let t = 0; t < terms; t++) {
    const a = assignTerm(ids, history, rnd);
    for (const id of ids) (history[id] ||= []).push(a[id].role);
    res.push(a);
  }
  return res;
}
