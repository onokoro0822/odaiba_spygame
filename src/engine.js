// ゲームの進行と、画面に返す状態を作るところ。データは D1（env.DB）に置く。
import C from './content.json';
import { scoreTerm, ROLES } from './scoring.js';
import { assignAll, assignTerm, TEAMS } from './roles.js';

export const PHASES = ['setup', 'brief', 'action', 'meeting', 'vote', 'result', 'end'];
const MIN = 60000;
export const now = () => Date.now();

export class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

export function token(n = 22) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return [...b].map(x => A[x % A.length]).join('');
}

// ---------- D1 の小さな道具 ----------
const all = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).all().then(r => r.results);
const one = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).first();
const run = (env, sql, ...a) => env.DB.prepare(sql).bind(...a).run();
const st = (env, sql, ...a) => env.DB.prepare(sql).bind(...a);
const bump = (env, g) => st(env, 'UPDATE games SET ver = ver + 1 WHERE id = ?', g.id);

// シナリオ（お題・手掛かり・接触の場所など）はゲームごとに持つ。作ったときの「編集中のシナリオ」を写して使うので、
// あとで編集しても進行中のゲームは変わらない。g.C がなければ同梱の content.json
export const DEFAULT = C;
export const CT = g => g?.C || C;
export const termOf = (g, t) => CT(g).terms[t - 1];
const scenCache = new Map();
export async function attach(env, g) {
  if (!g || g.C || !g.scen) return g;
  let c = scenCache.get(g.scen);
  if (!c) {
    const r = await env.DB.prepare('SELECT data FROM scen WHERE id = ?').bind(g.scen).first();
    if (r) { c = JSON.parse(r.data); if (scenCache.size > 50) scenCache.clear(); scenCache.set(g.scen, c); }
  }
  g.C = c || C;
  return g;
}
// 編集中のシナリオ（なければ同梱のもの）
export async function mainScenario(env) {
  const r = await env.DB.prepare("SELECT data, updated FROM scen WHERE id = 'main'").first();
  return r ? { data: JSON.parse(r.data), updated: r.updated } : { data: C, updated: null };
}
const opts = g => JSON.parse(g.opts || '{}');
export function durations(g) { return { ...C.durations, ...(opts(g).dur || {}) }; }
// GMが入れた、タームごとの行動開始の予定（開催日＋時刻、日本時間）
export function planStart(g, t) {
  const o = opts(g), hm = o.start?.[t];
  if (!o.date || !hm) return null;
  const ms = Date.parse(`${o.date}T${hm}:00+09:00`);
  return Number.isNaN(ms) ? null : ms;
}
// 接触の時刻は「行動開始から何分後」で持っている。行動の長さが違うゲームでは比例で縮める。
// 開始の予定が入っていればその時刻から、なければ実際に行動を始めた時刻から数える
function slotTimes(g, slot, t = g.term) {
  const k = durations(g).action / 60, base = planStart(g, t) ?? (t === g.term ? g.action_at : null);
  return { from: base == null ? null : base + Math.round(slot.from * k * MIN), to: base == null ? null : base + Math.round(slot.to * k * MIN), fromMin: Math.round(slot.from * k), toMin: Math.round(slot.to * k) };
}
function actionEnd(g) { return g.action_at == null ? null : g.action_at + durations(g).action * MIN; }

// ---------- ゲームを作る ----------
// mode：デモのとき、'player'（自分が参加者の1人）か 'gm'（自分がGM、16人ともコンピューター）
export async function createGame(env, { title, names, demo = false, dur, me = 0, mode, meRole }) {
  names = names.map(s => s.trim()).filter(Boolean);
  if (names.length < 12 || names.length > 21) throw new Bad('参加者は12〜21人にしてください');
  if (new Set(names).size !== names.length) throw new Bad('同じ名前が2回入っています');
  const { data } = await mainScenario(env);
  const id = token(10);
  const g = { id, gm: token(), title: title || data.title, demo: demo ? 1 : 0, opts: JSON.stringify({ ...(dur ? { dur } : {}), ...(mode ? { mode } : {}) }), created: now(), scen: 'g:' + id, C: data };
  const players = names.map((name, i) => ({ id: token(8), tok: token(), name, seat: i, bot: demo && i !== me ? 1 : 0 }));
  const plan = assignAll(players.map(p => p.id), CT(g).terms.length);
  // デモで自分の役職を決めておく（案内とやってみるは、できることが一番多い内通者にする）
  if (meRole && players[me]) {
    const a = plan[0], id = players[me].id, other = Object.keys(a).find(k => a[k].team === a[id].team && a[k].role === meRole);
    if (other && other !== id) [a[id].role, a[other].role] = [a[other].role, a[id].role];
  }
  const q = [st(env, 'INSERT INTO scen (id, title, data, updated) VALUES (?, ?, ?, ?)', g.scen, data.title, JSON.stringify(data), now()),
    st(env, 'INSERT INTO games (id, gm, title, demo, opts, created, scen) VALUES (?, ?, ?, ?, ?, ?, ?)', g.id, g.gm, g.title, g.demo, g.opts, g.created, g.scen)];
  for (const p of players) q.push(st(env, 'INSERT INTO players (id, game, tok, name, seat, bot) VALUES (?, ?, ?, ?, ?, ?)', p.id, g.id, p.tok, p.name, p.seat, p.bot));
  plan.forEach((a, i) => { for (const [pid, x] of Object.entries(a)) q.push(st(env, 'INSERT INTO roles (game, term, player, team, role) VALUES (?, ?, ?, ?, ?)', g.id, i + 1, pid, x.team, x.role)); });
  await env.DB.batch(q);
  return { game: g, players };
}

export async function deleteGame(env, id) {
  await env.DB.batch(['games:id', 'players:game', 'roles:game', 'odai:game', 'subs:game', 'photos:game', 'inbox:game', 'contacts:game', 'rights:game', 'sabotage:game', 'harikomi:game', 'kakuho:game', 'votes:game']
    .map(s => { const [t, c] = s.split(':'); return st(env, `DELETE FROM ${t} WHERE ${c} = ?`, id); }).concat(st(env, 'DELETE FROM scen WHERE id = ?', 'g:' + id)));
}

// 合言葉の代わりの長い文字列から、GMか参加者かを調べる
export async function who(env, k) {
  if (!k || k.length < 16) throw new Bad('ページが見つかりません', 404);
  let g = await one(env, 'SELECT * FROM games WHERE gm = ?', k);
  if (g) return { g: await attach(env, g), gm: true };
  const p = await one(env, 'SELECT * FROM players WHERE tok = ?', k);
  if (!p) throw new Bad('ページが見つかりません', 404);
  g = await one(env, 'SELECT * FROM games WHERE id = ?', p.game);
  // このタームのGMを任された参加者は、自分の鍵でGM手帳も開ける
  const r = g.term ? await one(env, 'SELECT role FROM roles WHERE game = ? AND term = ? AND player = ?', g.id, g.term, p.id) : null;
  return { g: await attach(env, g), p, gm: false, gmNow: r?.role === 'GM' };
}

// ---------- 読み出しの共通部分 ----------
async function load(env, g) {
  const t = g.term;
  const [players, roles] = await Promise.all([
    all(env, 'SELECT id, name, seat, bot, tok FROM players WHERE game = ? ORDER BY seat', g.id),
    all(env, 'SELECT term, player, team, role FROM roles WHERE game = ?', g.id),
  ]);
  const name = Object.fromEntries(players.map(p => [p.id, p.name]));
  // R：プレイする人だけ（GMのタームは入れない）。G：タームごとのGM。RA：GMも含めた全部（GM手帳の参加者の表用）
  const R = {}, G = {}, RA = {};
  for (const r of roles) {
    (RA[r.term] ||= {})[r.player] = r;
    if (r.role === 'GM') (G[r.term] ||= []).push(r.player); else (R[r.term] ||= {})[r.player] = r;
  }
  const cur = R[t] || {};
  return { t, players, name, R, G, RA, cur };
}
const holder = (cur, team, role) => Object.values(cur).find(r => r.team === team && r.role === role)?.player;
const teamOf = (cur, pid) => cur[pid]?.role ? cur[pid].team : null;

async function msg(env, g, player, kind, title, body) {
  return st(env, 'INSERT INTO inbox (game, player, term, kind, title, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)', g.id, player, g.term, kind, title, body, now());
}
function toAll(env, g, L, kind, title, body, filter = () => true) {
  return Object.values(L.cur).filter(r => r.role && filter(r)).map(r => st(env, 'INSERT INTO inbox (game, player, term, kind, title, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)', g.id, r.player, g.term, kind, title, body, now()));
}

// ---------- 結果（得点） ----------
async function termResult(env, g, L, t) {
  const [votes, kak, sab] = await Promise.all([
    all(env, 'SELECT * FROM votes WHERE game = ? AND term = ?', g.id, t),
    all(env, 'SELECT team, score, checks FROM kakuho WHERE game = ? AND term = ?', g.id, t),
    all(env, "SELECT team, COUNT(*) AS n FROM sabotage WHERE game = ? AND term = ? GROUP BY team", g.id, t),
  ]);
  const T = termOf(g, t), bepNos = T.checks.filter(c => c.bep).map(c => c.no);
  const teams = {};
  for (const tm of TEAMS) teams[tm] = { kakuho: 0, bep3: 0, bougai: 0 };
  for (const k of kak) { const ch = JSON.parse(k.checks || '[]'); teams[k.team].kakuho = k.score ?? 0; teams[k.team].bep3 = ch.filter(n => bepNos.includes(n)).length; teams[k.team].checks = ch; }
  for (const s of sab) teams[s.team].bougai = s.n;
  const V = Object.fromEntries(votes.map(v => [v.player, v]));
  const members = Object.values(L.R[t] || {}).filter(r => r.role).map(r => ({ id: r.player, team: r.team, role: r.role, vote: V[r.player] ? { s: V[r.player].s, b: V[r.player].b, t: V[r.player].t } : {} }));
  const sc = scoreTerm(members, teams, CT(g).sabotageMax);
  return {
    t, teams: TEAMS.map(tm => ({ team: tm, ...teams[tm], top: sc[members.find(m => m.team === tm)?.id]?.top ?? false })),
    players: members.map(m => ({ id: m.id, name: L.name[m.id], team: m.team, role: m.role, vote: { s: L.name[m.vote.s] || '', b: L.name[m.vote.b] || '', t: L.name[m.vote.t] || '' }, voted: !!V[m.id], pt: sc[m.id].pt }))
      .sort((a, b) => b.pt - a.pt),
  };
}
function finished(g, t) { return t < g.term || (t === g.term && (g.phase === 'result' || g.phase === 'end')); }
async function results(env, g, L) {
  const out = [];
  for (let t = 1; t <= CT(g).terms.length; t++) if (finished(g, t)) out.push(await termResult(env, g, L, t));
  const tot = {};
  for (const r of out) for (const p of r.players) { const x = tot[p.id] ||= { id: p.id, name: p.name, sum: 0, by: {}, played: 0 }; x.sum += p.pt; x.by[r.t] = p.pt; x.played++; }
  // GMや休みで参加したタームが少ない人は、合計を（終わったターム数 ÷ 参加したターム数）倍してそろえる（3タームのうち2つなら1.5倍）
  const n = out.length, L2 = Object.values(tot);
  for (const x of L2) { x.rate = x.played ? n / x.played : 0; x.adj = Math.round(x.sum * x.rate * 10) / 10; }
  for (const r of out) for (const pid of L.G[r.t] || []) { const x = tot[pid]; if (x) x.by[r.t] = 'GM'; }
  return { terms: out, totals: L2.sort((a, b) => b.adj - a.adj || b.sum - a.sum), scaled: L2.some(x => x.rate !== 1), gms: Object.fromEntries(out.map(r => [r.t, (L.G[r.t] || []).map(id => L.name[id])])) };
}

// ---------- 画面に返す状態（参加者） ----------
export async function playerState(env, g, p) {
  const L = await load(env, g), t = g.term, me = L.cur[p.id];
  const base = { v: g.ver, now: now(), game: gameInfo(g), me: { id: p.id, name: p.name }, players: L.players.map(x => ({ id: x.id, name: x.name })) };
  const inbox = await all(env, 'SELECT id, term, kind, title, body, at FROM inbox WHERE game = ? AND player = ? ORDER BY id DESC LIMIT 200', g.id, p.id);
  base.inbox = inbox;
  if (g.phase !== 'setup' && g.phase !== 'end') base.res = await results(env, g, L);
  else if (g.phase === 'end') base.res = await results(env, g, L);
  if (t === 0 || !me || !me.role) { base.gmNow = !!L.G[t]?.includes(p.id); base.rest = t > 0 && !base.gmNow; base.gmTerms = Object.entries(L.G).filter(([, ids]) => ids.includes(p.id)).map(([k]) => Number(k)).filter(k => k <= t); return base; }
  const T = termOf(g, t), team = me.team;
  const mates = Object.values(L.cur).filter(r => r.team === team && r.role).map(r => ({ id: r.player, name: L.name[r.player] }));
  const [od, subs, sab, kak, vote, rights] = await Promise.all([
    all(env, 'SELECT no, state, team, ord, opened_at FROM odai WHERE game = ? AND term = ?', g.id, t),
    all(env, 'SELECT id, kind, ref, state, note, at, player, team, photo FROM subs WHERE game = ? AND term = ? AND (player = ? OR (team = ? AND state = \'ok\')) ORDER BY id DESC', g.id, t, p.id, team),
    all(env, 'SELECT id, team, floor, state, at FROM sabotage WHERE game = ? AND term = ?', g.id, t),
    one(env, 'SELECT sub FROM kakuho WHERE game = ? AND term = ? AND team = ?', g.id, t, team),
    one(env, 'SELECT s, b, t FROM votes WHERE game = ? AND term = ? AND player = ?', g.id, t, p.id),
    all(env, 'SELECT source, used_at FROM rights WHERE game = ? AND term = ? AND player = ?', g.id, t, p.id),
  ]);
  const odai = od.filter(o => o.state !== 'wait').map(o => ({ ...T.odai.find(x => x.no === o.no), state: o.state, team: o.team, ord: o.ord }))
    .sort((a, b) => (a.state === 'open' ? 0 : 1) - (b.state === 'open' ? 0 : 1) || a.no - b.no);
  const s = {
    ...base, mall: T.mall, team, role: me.role, mates, odai,
    left: od.filter(o => o.state === 'wait').length, taken: od.filter(o => o.state === 'taken').length,
    subs: subs.map(x => ({ ...x, mine: x.player === p.id, name: L.name[x.player] })),
    sabotage: sab.filter(x => x.state === 'active').map(x => ({ id: x.id, team: x.team, floor: x.floor })),
    sabCount: sab.filter(x => x.team === team).length,
    kakuho: kak ? kak.sub : null, vote, actionEnd: actionEnd(g), floors: T.floors,
    rights: rights.filter(r => !r.used_at).length,
  };
  const c = T.contacts[me.role];
  if (c) {
    const done = await all(env, 'SELECT slot FROM contacts WHERE game = ? AND term = ? AND role = ? AND player = ?', g.id, t, me.role, p.id);
    s.contact = { pw: c.pw, slots: c.slots.map(x => ({ n: x.n, place: x.place, ...slotTimes(g, x), done: done.some(d => d.slot === x.n) })) };
  }
  if (me.role === '密使') s.bep = T.bep;
  if (me.role === '内通者') {
    s.answer = T.answer;
    const H = await all(env, 'SELECT id, team, target, action, done FROM harikomi WHERE game = ? AND term = ? ORDER BY team, id', g.id, t);
    s.harikomi = H.map(h => ({ id: h.id, team: h.team, target: L.name[h.target], action: h.action, done: !!h.done }));
  }
  return s;
}
function gameInfo(g) {
  const o = opts(g);
  return { id: g.id, title: g.title, term: g.term, terms: CT(g).terms.length, phase: g.phase, phase_at: g.phase_at, action_at: g.action_at, dur: durations(g), demo: !!g.demo, mall: g.term ? termOf(g, g.term).mall : null,
    mode: o.mode || null, plan: { date: o.date || '', start: o.start || {}, at: Object.fromEntries(CT(g).terms.map(T => [T.t, planStart(g, T.t)])) }, malls: CT(g).terms.map(T => T.mall) };
}

// 開催日と、タームごとの行動開始の予定を入れる
export async function setPlan(env, g, date, start) {
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Bad('開催日の形が違います');
  const st2 = {};
  for (const T of CT(g).terms) { const v = start?.[T.t]; if (!v) continue; if (!/^\d{1,2}:\d{2}$/.test(v)) throw new Bad(`ターム${T.t}の時刻の形が違います`); st2[T.t] = v.padStart(5, '0'); }
  const o = { ...opts(g), date: date || '', start: st2 };
  await env.DB.batch([st(env, 'UPDATE games SET opts = ?, ver = ver + 1 WHERE id = ?', JSON.stringify(o), g.id)]);
}

// ---------- 画面に返す状態（GM） ----------
// by：GMを任された参加者が開いているとき、その人。主催者でないので、ほかの人のURLと、これからのタームの役職は見せない
export async function gmState(env, g, by = null) {
  const L = await load(env, g), t = g.term;
  const roles = by ? Object.fromEntries(Object.entries(L.RA).filter(([k]) => Number(k) <= t)) : L.RA;
  const s = { v: g.ver, now: now(), gm: true, by: by ? { id: by.id, name: by.name } : null, game: gameInfo(g),
    players: L.players.map(p => ({ id: p.id, name: p.name, tok: by ? null : p.tok, bot: !!p.bot })), roles, gms: L.G };
  s.res = await results(env, g, L);
  // 3ターム分の予定表（行動開始と接触の時刻）
  s.schedule = CT(g).terms.map(T => ({ t: T.t, mall: T.mall, start: planStart(g, T.t) ?? (T.t === t ? g.action_at : null),
    contacts: Object.entries(T.contacts).flatMap(([role, c]) => c.slots.map(x => ({ role, n: x.n, place: x.place, pw: c.pw, ...slotTimes(g, x, T.t) }))).sort((a, b) => a.fromMin - b.fromMin) }));
  if (t === 0) return s;
  const T = termOf(g, t);
  const [od, subs, sab, H, kak, votes, con, rights] = await Promise.all([
    all(env, 'SELECT no, state, team, ord, sub FROM odai WHERE game = ? AND term = ?', g.id, t),
    all(env, 'SELECT id, kind, ref, state, note, at, player, team, photo, judged_at FROM subs WHERE game = ? AND term = ? ORDER BY at', g.id, t),
    all(env, 'SELECT * FROM sabotage WHERE game = ? AND term = ? ORDER BY id', g.id, t),
    all(env, 'SELECT * FROM harikomi WHERE game = ? AND term = ? ORDER BY team, id', g.id, t),
    all(env, 'SELECT * FROM kakuho WHERE game = ? AND term = ?', g.id, t),
    all(env, 'SELECT player FROM votes WHERE game = ? AND term = ?', g.id, t),
    all(env, 'SELECT role, slot, player FROM contacts WHERE game = ? AND term = ?', g.id, t),
    all(env, 'SELECT player, source, used_at FROM rights WHERE game = ? AND term = ?', g.id, t),
  ]);
  const odaiInfo = no => { const o = T.odai.find(x => x.no === no); return o ? { no, title: o.title, order: o.order, cond: o.cond, sample: !!o.sample } : null; };
  s.term = { t, mall: T.mall, answer: T.answer, checks: T.checks, bep: T.bep, floors: T.floors, actionEnd: actionEnd(g) };
  s.odai = od.map(o => ({ ...odaiInfo(o.no), state: o.state, team: o.team, ord: o.ord })).sort((a, b) => a.no - b.no);
  s.subs = subs.map(x => ({ ...x, name: L.name[x.player],
    what: x.kind === 'odai' ? odaiInfo(x.ref) : x.kind === 'harikomi' ? (h => h && { team: h.team, target: L.name[h.target], action: h.action })(H.find(h => h.id === x.ref)) : x.kind === 'kinkyu' ? (z => z && { team: z.team, floor: z.floor })(sab.find(z => z.id === x.ref)) : null,
    earlier: x.kind === 'odai' && x.state === 'pending' && subs.some(y => y.kind === 'odai' && y.ref === x.ref && y.state === 'pending' && y.at < x.at) }));
  s.sabotage = sab.map(z => ({ id: z.id, team: z.team, floor: z.floor, state: z.state, by: L.name[z.by], at: z.at }));
  s.harikomi = H.map(h => ({ id: h.id, team: h.team, target: L.name[h.target], action: h.action, done: !!h.done }));
  s.kakuho = TEAMS.map(tm => { const k = kak.find(x => x.team === tm); return { team: tm, sub: k?.sub ?? null, photo: k ? subs.find(x => x.id === k.sub)?.photo : null, checks: k?.checks ? JSON.parse(k.checks) : null, score: k?.score ?? null }; });
  s.voted = votes.map(v => v.player);
  s.contacts = Object.entries(T.contacts).map(([role, c]) => ({ role, pw: c.pw, slots: c.slots.map(x => ({ n: x.n, place: x.place, ...slotTimes(g, x),
    who: TEAMS.map(tm => { const pid = holder(L.cur, tm, role); return pid && { id: pid, name: L.name[pid], team: tm, done: con.some(k => k.role === role && k.slot === x.n && k.player === pid) }; }).filter(Boolean) })) }));
  s.rights = Object.values(L.cur).filter(r => r.role === '内通者' || r.role === '蜃気楼').map(r => ({ id: r.player, name: L.name[r.player], team: r.team, role: r.role,
    left: rights.filter(x => x.player === r.player && !x.used_at).length, used: rights.filter(x => x.player === r.player && x.used_at).length }));
  return s;
}

// ---------- 参加者の操作 ----------
export async function upload(env, g, p, kind, ref, data) {
  const L = await load(env, g), me = L.cur[p.id];
  if (!me?.role) throw new Bad('このタームは参加していません');
  if (g.phase !== 'action') throw new Bad('いまは行動の時間ではありません');
  // 案内・やってみるのデモは時間で締め切らない
  const timed = !(g.demo && ['tour-player', 'tour-gm', 'try-player', 'try-gm'].includes(opts(g).mode));
  if (timed && now() > actionEnd(g) + 30000) throw new Bad('行動の時間は終わりました');
  if (data && data.byteLength > 1_900_000) throw new Bad('写真が大きすぎます');
  if (!data && !g.demo) throw new Bad('写真がありません');
  const t = g.term, team = me.team;
  const active = await all(env, "SELECT id, team FROM sabotage WHERE game = ? AND term = ? AND state = 'active'", g.id, t);
  if (kind === 'odai') {
    const o = await one(env, 'SELECT state FROM odai WHERE game = ? AND term = ? AND no = ?', g.id, t, ref);
    if (!o || o.state === 'wait') throw new Bad('このお題はまだ出ていません');
    if (o.state === 'taken') throw new Bad('このお題はもう獲得されました');
    if (active.length) throw new Bad('緊急任務が出ているあいだは、お題を獲得できません');
    const dup = await one(env, "SELECT id FROM subs WHERE game = ? AND term = ? AND kind = 'odai' AND ref = ? AND team = ? AND state = 'pending'", g.id, t, ref, team);
    if (dup) throw new Bad('このお題は、チームの写真が判定待ちです');
  } else if (kind === 'kinkyu') {
    if (!active.some(z => z.id === ref && z.team === team)) throw new Bad('チームに緊急任務は出ていません');
    const dup = await one(env, "SELECT id FROM subs WHERE game = ? AND kind = 'kinkyu' AND ref = ? AND state = 'pending'", g.id, ref);
    if (dup) throw new Bad('緊急任務の写真は判定待ちです');
  } else if (kind === 'harikomi') {
    if (me.role !== '内通者') throw new Bad('張り込みは内通者だけです');
    const h = await one(env, 'SELECT done FROM harikomi WHERE game = ? AND term = ? AND id = ?', g.id, t, ref);
    if (!h) throw new Bad('張り込みが見つかりません');
    if (h.done) throw new Bad('この張り込みはもう達成されています');
  } else if (kind === 'kakuho') {
    const k = await one(env, 'SELECT sub FROM kakuho WHERE game = ? AND term = ? AND team = ?', g.id, t, team);
    if (k) throw new Bad('チームの確保写真はもう出ています');
    ref = null;
  } else throw new Bad('投稿の種類が分かりません');

  // デモのコンピューターの投稿は写真なし（photo = NULL）
  const photo = data ? (await run(env, 'INSERT INTO photos (game, data) VALUES (?, ?)', g.id, data)).meta.last_row_id : null;
  const state = kind === 'kakuho' ? 'ok' : 'pending';
  const r = await run(env, 'INSERT INTO subs (game, term, kind, ref, player, team, at, state, photo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', g.id, t, kind, ref, p.id, team, now(), state, photo);
  const sid = r.meta.last_row_id, q = [bump(env, g)];
  if (kind === 'kakuho') {
    q.push(st(env, 'INSERT INTO kakuho (game, term, team, sub) VALUES (?, ?, ?, ?)', g.id, t, team, sid));
    q.push(...toAll(env, g, L, 'info', '確保写真を受け付けました', `${p.name}さんが${team}チームの確保写真を出しました。採点は答え合わせで発表します。`, x => x.team === team));
  }
  await env.DB.batch(q);
  return { id: sid };
}

export async function vote(env, g, p, v) {
  const L = await load(env, g), me = L.cur[p.id];
  if (!me?.role) throw new Bad('このタームは参加していません');
  if (g.phase !== 'meeting' && g.phase !== 'vote') throw new Bad('いまは投票できません');
  const mates = Object.values(L.cur).filter(r => r.team === me.team && r.role).map(r => r.player);
  const own = { 内通者: 's', 密使: 'b', 蜃気楼: 't' }[me.role];
  const x = {};
  for (const k of ['s', 'b', 't']) {
    x[k] = k === own ? p.id : v[k] || null;
    if (x[k] && !mates.includes(x[k])) throw new Bad('自分のチームの人から選んでください');
  }
  await env.DB.batch([st(env, 'INSERT OR REPLACE INTO votes (game, term, player, s, b, t, at) VALUES (?, ?, ?, ?, ?, ?, ?)', g.id, g.term, p.id, x.s, x.b, x.t, now()), bump(env, g)]);
}

export async function sabotage(env, g, p) {
  const L = await load(env, g), me = L.cur[p.id];
  if (g.phase !== 'action') throw new Bad('妨害は行動の時間だけ使えます');
  const r = await one(env, 'SELECT id FROM rights WHERE game = ? AND term = ? AND player = ? AND used_at IS NULL ORDER BY id LIMIT 1', g.id, g.term, p.id);
  if (!r) throw new Bad('妨害の権利がありません');
  const T = termOf(g, g.term), floor = T.floors[Math.floor(Math.random() * T.floors.length)];
  const res = await run(env, 'INSERT INTO sabotage (game, term, team, by, floor, at) VALUES (?, ?, ?, ?, ?, ?)', g.id, g.term, me.team, p.id, floor, now());
  await env.DB.batch([
    st(env, 'UPDATE rights SET used_at = ? WHERE id = ?', now(), r.id), bump(env, g),
    ...toAll(env, g, L, 'alert', '緊急任務', `${me.team}チームに緊急任務：${floor}階で、${me.team}チームの3人以上で写れ。写真が認められるまで、全チームお題を獲得できません。`),
  ]);
  return { id: res.meta.last_row_id };
}

// ---------- GMの操作 ----------
export async function phase(env, g, to) {
  const L = await load(env, g), i = PHASES.indexOf(g.phase), q = [];
  const next = g.phase === 'result' ? (g.term < CT(g).terms.length ? 'brief' : 'end') : g.phase === 'setup' ? 'brief' : PHASES[i + 1];
  if (to !== next) throw new Bad('この順番では進められません');
  if (to === 'brief') {
    const t = g.term + 1, T = termOf(g, t);
    const bad = checkRoles({ [t]: L.R[t] || {} });
    if (bad.length) throw new Bad(`役職の割り振りを直してください：${bad.join('、')}`);
    q.push(st(env, "UPDATE games SET term = ?, phase = 'brief', phase_at = ?, action_at = NULL, ver = ver + 1 WHERE id = ?", t, now(), g.id));
    T.odai.forEach(o => q.push(st(env, 'INSERT OR IGNORE INTO odai (game, term, no) VALUES (?, ?, ?)', g.id, t, o.no)));
    // 張り込み：チームごとに、内通者以外の人の「瞬間」を5つ
    const cur = L.R[t] || {}, acts = CT(g).harikomiActions.slice().sort(() => Math.random() - .5);
    let ai = 0;
    for (const tm of TEAMS) {
      const M = Object.values(cur).filter(r => r.team === tm && r.role && r.role !== '内通者').map(r => r.player).sort(() => Math.random() - .5);
      for (let k = 0; k < CT(g).harikomiPerTeam && M.length; k++) q.push(st(env, 'INSERT INTO harikomi (game, term, team, target, action) VALUES (?, ?, ?, ?, ?)', g.id, t, tm, M[k % M.length], acts[ai++ % acts.length]));
    }
    for (const pid of L.G[t] || []) q.push(st(env, 'INSERT INTO inbox (game, player, term, kind, title, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)', g.id, pid, t, 'role', `ターム${t}はGMです`, 'このタームはGMを担当します。「いま」の画面から GM手帳 を開いてください。', now()));
    for (const r of Object.values(cur)) {
      if (!r.role) { q.push(st(env, 'INSERT INTO inbox (game, player, term, kind, title, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)', g.id, r.player, t, 'info', `ターム${t}はお休みです`, 'このタームは見学です。次のタームを待ってください。', now())); continue; }
      q.push(st(env, 'INSERT INTO inbox (game, player, term, kind, title, body, at) VALUES (?, ?, ?, ?, ?, ?, ?)', g.id, r.player, t, 'role', `ターム${t}　${T.mall}`, `あなたは${r.team}チームです。役職は「役職」の画面で、まわりに見えないようにして確かめてください。`, now()));
    }
  } else if (to === 'action') {
    const t = g.term;
    q.push(st(env, "UPDATE games SET phase = 'action', phase_at = ?, action_at = ?, ver = ver + 1 WHERE id = ?", now(), now(), g.id));
    q.push(st(env, `UPDATE odai SET state = 'open', opened_at = ? WHERE game = ? AND term = ? AND no IN (SELECT no FROM odai WHERE game = ? AND term = ? ORDER BY no LIMIT ${CT(g).openCount})`, now(), g.id, t, g.id, t));
    q.push(...toAll(env, g, L, 'info', '行動開始', `行動の時間は${durations(g).action}分です。お題の写真を撮って投稿してください。`));
  } else if (to === 'result') {
    const kak = await all(env, 'SELECT team, score FROM kakuho WHERE game = ? AND term = ?', g.id, g.term);
    if (kak.some(k => k.score == null)) throw new Bad('確保写真の採点が終わっていません');
    q.push(st(env, "UPDATE games SET phase = 'result', phase_at = ?, ver = ver + 1 WHERE id = ?", now(), g.id));
    q.push(...toAll(env, g, L, 'info', `ターム${g.term}の結果`, '結果のページで、正体と点数を確かめてください。'));
  } else {
    q.push(st(env, 'UPDATE games SET phase = ?, phase_at = ?, ver = ver + 1 WHERE id = ?', to, now(), g.id));
    if (to === 'meeting') q.push(...toAll(env, g, L, 'info', '行動終了', `作戦会議の時間です（${durations(g).meeting}分）。会議が終わるまでに投票してください。`));
    if (to === 'vote') q.push(...toAll(env, g, L, 'info', '投票', '内通者・密使・蜃気楼だと思う人を、チームの中から1人ずつ選んでください。'));
  }
  await env.DB.batch(q);
}

export async function judge(env, g, sid, ok, note = '') {
  const L = await load(env, g), t = g.term;
  const s = await one(env, 'SELECT * FROM subs WHERE game = ? AND id = ?', g.id, sid);
  if (!s) throw new Bad('投稿が見つかりません');
  if (s.state !== 'pending') throw new Bad('この投稿は判定済みです');
  const q = [bump(env, g)], T = termOf(g, s.term), pname = L.name[s.player];
  const set = (state, n = note) => st(env, 'UPDATE subs SET state = ?, note = ?, judged_at = ? WHERE id = ?', state, n || null, now(), sid);
  if (!ok) {
    q.push(set('ng'));
    const what = s.kind === 'odai' ? `お題${s.ref}「${T.odai.find(o => o.no === s.ref)?.title}」` : s.kind === 'kinkyu' ? '緊急任務' : '張り込み';
    q.push(await msg(env, g, s.player, 'ng', `${what}：認められませんでした`, note ? `GMより：${note}` : 'もう一度撮って投稿してください。'));
  } else if (s.kind === 'odai') {
    const o = await one(env, 'SELECT state FROM odai WHERE game = ? AND term = ? AND no = ?', g.id, s.term, s.ref);
    if (o.state === 'taken') { q.push(set('late', '先に別のチームが獲得しました')); await env.DB.batch(q); return { late: true }; }
    const earlier = await one(env, "SELECT id FROM subs WHERE game = ? AND term = ? AND kind = 'odai' AND ref = ? AND state = 'pending' AND at < ?", g.id, s.term, s.ref, s.at);
    if (earlier) throw new Bad('同じお題に、先に投稿された写真があります。先にそちらを判定してください');
    const ord = (await one(env, "SELECT COUNT(*) AS n FROM odai WHERE game = ? AND term = ? AND state = 'taken'", g.id, s.term)).n + 1;
    const rw = T.rewards[ord - 1], od = T.odai.find(x => x.no === s.ref);
    q.push(set('ok'));
    q.push(st(env, "UPDATE odai SET state = 'taken', taken_at = ?, team = ?, sub = ?, ord = ? WHERE game = ? AND term = ? AND no = ?", now(), s.team, sid, ord, g.id, s.term, s.ref));
    q.push(st(env, "UPDATE odai SET state = 'open', opened_at = ? WHERE game = ? AND term = ? AND no = (SELECT no FROM odai WHERE game = ? AND term = ? AND state = 'wait' ORDER BY no LIMIT 1)", now(), g.id, s.term, g.id, s.term));
    q.push(st(env, "UPDATE subs SET state = 'late', note = '先に別のチームが獲得しました', judged_at = ? WHERE game = ? AND term = ? AND kind = 'odai' AND ref = ? AND state = 'pending' AND id != ?", now(), g.id, s.term, s.ref, sid));
    if (rw) q.push(await msg(env, g, s.player, 'reward', `${ord}番目の獲得：${rw.kind}`, rw.text));
    q.push(...toAll(env, g, L, 'take', `${s.team}チームがお題${s.ref}を獲得`, `「${od.title}」を${s.team}チームの${pname}さんが獲得しました。`, r => r.team === s.team && r.player !== s.player));
  } else if (s.kind === 'kinkyu') {
    q.push(set('ok'));
    q.push(st(env, "UPDATE sabotage SET state = 'cleared', cleared_at = ? WHERE id = ?", now(), s.ref));
    const left = await one(env, "SELECT COUNT(*) AS n FROM sabotage WHERE game = ? AND term = ? AND state = 'active' AND id != ?", g.id, s.term, s.ref);
    q.push(...toAll(env, g, L, 'info', '緊急任務の解除', `${s.team}チームの緊急任務を確認しました。${left.n ? 'まだ別の緊急任務が残っています。' : 'お題の獲得を再開できます。'}`));
  } else if (s.kind === 'harikomi') {
    const h = await one(env, 'SELECT * FROM harikomi WHERE id = ?', s.ref);
    q.push(set('ok'));
    q.push(st(env, 'UPDATE harikomi SET done = ? WHERE id = ?', sid, h.id));
    const sp = holder(L.cur, h.team, '内通者');
    const got = sp ? (await one(env, "SELECT COUNT(*) AS n FROM rights WHERE game = ? AND term = ? AND player = ? AND source = 'harikomi'", g.id, s.term, sp)).n : CT(g).harikomiMax;
    if (sp && got < CT(g).harikomiMax) {
      q.push(st(env, "INSERT INTO rights (game, term, player, source, at) VALUES (?, ?, ?, 'harikomi', ?)", g.id, s.term, sp, now()));
      q.push(await msg(env, g, sp, 'right', '張り込み成功：妨害の権利が増えました', `${h.team}チームの張り込み「${L.name[h.target]}さんが${h.action}瞬間」が達成されました。好きなときに妨害を発動できます。`));
    }
    if (s.player !== sp) q.push(await msg(env, g, s.player, 'ok', '張り込み成功', `「${L.name[h.target]}さんが${h.action}瞬間」が認められました。${h.team}チームの内通者に妨害の権利が届きます。`));
  }
  await env.DB.batch(q);
  return {};
}

export async function contact(env, g, role, slot, pid) {
  const L = await load(env, g), T = termOf(g, g.term), r = L.cur[pid];
  if (g.phase !== 'action') throw new Bad('接触は行動の時間だけです');
  if (!r || r.role !== role || !T.contacts[role]?.slots.some(x => x.n === slot)) throw new Bad('この人はこの接触の対象ではありません');
  const done = await one(env, 'SELECT 1 FROM contacts WHERE game = ? AND term = ? AND role = ? AND slot = ? AND player = ?', g.id, g.term, role, slot, pid);
  if (done) throw new Bad('この人はこの回の接触を済ませています');
  const q = [st(env, 'INSERT INTO contacts (game, term, role, slot, player, at) VALUES (?, ?, ?, ?, ?, ?)', g.id, g.term, role, slot, pid, now()), bump(env, g)];
  const right = () => st(env, "INSERT INTO rights (game, term, player, source, at) VALUES (?, ?, ?, 'contact', ?)", g.id, g.term, pid, now());
  if (role === '密使') {
    const prev = await all(env, "SELECT body FROM inbox WHERE game = ? AND term = ? AND player = ? AND kind = 'contact'", g.id, g.term, pid);
    const koan = Object.values(L.cur).filter(x => x.team === r.team && x.role === '公安').map(x => L.name[x.player]);
    const nm = koan.find(n => !prev.some(m => m.body.includes(`${n}さん`)));
    q.push(await msg(env, g, pid, 'contact', `接触成功（${slot}回目）`, nm ? `あなたのチームの公安の1人は${nm}さんです。` : 'あなたのチームの公安は、もう全員教えました。'));
  } else if (role === '蜃気楼' && slot === 1) {
    q.push(await msg(env, g, pid, 'contact', '接触成功（1回目）', `あなたのチームの内通者は${L.name[holder(L.cur, r.team, '内通者')]}さんです。`));
  } else {
    q.push(right());
    q.push(await msg(env, g, pid, 'contact', `接触成功（${slot}回目）`, '妨害を1回発動できます。好きなときに「妨害を発動」を押してください。'));
  }
  await env.DB.batch(q);
}

export async function scoreKakuho(env, g, team, checks) {
  const T = termOf(g, g.term);
  if (!['meeting', 'vote', 'action'].includes(g.phase)) throw new Bad('いまは採点できません');
  const k = await one(env, 'SELECT sub FROM kakuho WHERE game = ? AND term = ? AND team = ?', g.id, g.term, team);
  if (!k) throw new Bad('このチームの確保写真はまだありません');
  const ch = [...new Set(checks.map(Number))].filter(n => T.checks.some(c => c.no === n)).sort((a, b) => a - b);
  await env.DB.batch([st(env, 'UPDATE kakuho SET checks = ?, score = ? WHERE game = ? AND term = ? AND team = ?', JSON.stringify(ch), ch.length, g.id, g.term, team), bump(env, g)]);
}

export async function clearSabotage(env, g, id) {
  const L = await load(env, g);
  const z = await one(env, "SELECT * FROM sabotage WHERE game = ? AND id = ? AND state = 'active'", g.id, id);
  if (!z) throw new Bad('この緊急任務は出ていません');
  await env.DB.batch([st(env, "UPDATE sabotage SET state = 'cleared', cleared_at = ? WHERE id = ?", now(), id),
    st(env, "UPDATE subs SET state = 'ng', note = 'GMが解除しました', judged_at = ? WHERE game = ? AND kind = 'kinkyu' AND ref = ? AND state = 'pending'", now(), g.id, id), bump(env, g),
    ...toAll(env, g, L, 'info', '緊急任務の解除', `${z.team}チームの緊急任務をGMが解除しました。`)]);
}

export async function editRole(env, g, t, pid, team, role) {
  if (t <= g.term) throw new Bad('始まったタームの役職は変えられません');
  if (role && role !== 'GM' && !ROLES.includes(role)) throw new Bad('役職が分かりません');
  if (role && role !== 'GM' && !TEAMS.includes(team)) throw new Bad('チームが分かりません');
  await env.DB.batch([st(env, 'INSERT OR REPLACE INTO roles (game, term, player, team, role) VALUES (?, ?, ?, ?, ?)', g.id, t, pid, role && role !== 'GM' ? team : null, role || null), bump(env, g)]);
}

// これからのタームを割り振り直す。GMと休みに決めた人はそのまま、残りの人でチームと役職を作る
export async function reshuffle(env, g) {
  if (g.phase !== 'setup' && g.phase !== 'result') throw new Bad('いまは割り振り直せません');
  const L = await load(env, g), ids = L.players.map(p => p.id);
  const from = g.term + 1, q = [bump(env, g)], history = {};
  for (let t = 1; t < from; t++) for (const [id, r] of Object.entries(L.R[t] || {})) if (r.role) (history[id] ||= []).push(r.role);
  for (let t = from; t <= CT(g).terms.length; t++) {
    const fixed = id => L.RA[t]?.[id] && (L.RA[t][id].role === 'GM' || L.RA[t][id].role == null);
    const a = assignTerm(ids.filter(id => !fixed(id)), history);
    for (const [id, x] of Object.entries(a)) { (history[id] ||= []).push(x.role); q.push(st(env, 'INSERT OR REPLACE INTO roles (game, term, player, team, role) VALUES (?, ?, ?, ?, ?)', g.id, t, id, x.team, x.role)); }
  }
  await env.DB.batch(q);
}

// 各チームに特殊役職が1人ずついるか（休みを入れたあとに崩れていないか）
export function checkRoles(roleMap) {
  const out = [];
  for (const [t, m] of Object.entries(roleMap)) for (const tm of TEAMS) for (const r of ['内通者', '密使', '蜃気楼']) {
    const n = Object.values(m).filter(x => x.team === tm && x.role === r).length;
    if (n !== 1) out.push(`ターム${t} ${tm}チームの${r}が${n}人`);
  }
  return out;
}

export async function photo(env, g, viewer, id) {
  const ph = await one(env, 'SELECT p.data, s.player, s.team, s.term FROM photos p LEFT JOIN subs s ON s.photo = p.id WHERE p.game = ? AND p.id = ?', g.id, id);
  if (!ph) throw new Bad('写真が見つかりません', 404);
  if (viewer) {
    const r = await one(env, 'SELECT team FROM roles WHERE game = ? AND term = ? AND player = ?', g.id, ph.term, viewer.id);
    if (ph.player !== viewer.id && !(r && r.team === ph.team) && !finished(g, ph.term)) throw new Bad('この写真は見られません', 403);
  }
  return ph.data;
}
