// デモ用：コンピューターの参加者とGM。
// デモのゲームの状態を誰かが読みに来るたびに tick() が呼ばれ、前回からの経過時間に応じて少しずつ動く。
import * as E from './engine.js';

const SEC = 1000;
// デモの進み方（秒）。役職発表と結果発表は、この時間がたつと次へ進む
const WAIT = { brief: 40, result: 120 };
const NG_NOTES = ['条件が写っていない', 'ぶれて見えない', '場所が違う'];

const pick = a => a[Math.floor(Math.random() * a.length)];
// 1秒あたりの確率 p で起きることが、dt 秒のあいだに起きたか
const chance = (p, dt) => Math.random() < 1 - Math.pow(1 - p, dt);

export async function tick(env, g) {
  const t = E.now();
  // 同時に何人も読みに来ても、動かすのは1回だけ
  const last = g.bot_at || g.created;
  if (t - last < 4 * SEC) return false;
  const lock = await env.DB.prepare('UPDATE games SET bot_at = ? WHERE id = ? AND (bot_at IS NULL OR bot_at = ?)').bind(t, g.id, g.bot_at ?? null).run();
  if (!lock.meta.changes) return false;
  const dt = Math.min(30, (t - last) / SEC);
  try { return await step(env, g, t, dt); } catch (e) { console.error('bot', e); return false; }
}

async function step(env, g, t, dt) {
  const d = E.durations(g), since = (t - (g.phase_at || g.created)) / SEC;
  const db = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  // ---- 時間がきたら進める（GMの代わり） ----
  const next = { brief: ['action', WAIT.brief], action: ['meeting', d.action * 60], meeting: ['vote', d.meeting * 60], vote: ['result', d.vote * 60], result: [g.term < E.content.terms.length ? 'brief' : 'end', WAIT.result] }[g.phase];
  if (g.phase === 'setup') { await E.phase(env, g, 'brief'); return true; }
  if (!next) return false;
  if (since >= next[1]) {
    await catchUp(env, g, next[0]);
    await E.phase(env, g, next[0]);
    return true;
  }
  const players = (await db('SELECT * FROM players WHERE game = ?', g.id).all()).results;
  const roles = (await db('SELECT * FROM roles WHERE game = ? AND term = ? AND role IS NOT NULL', g.id, g.term).all()).results;
  const P = Object.fromEntries(players.map(p => [p.id, p]));
  const bots = roles.filter(r => P[r.player].bot);
  let changed = false;

  if (g.phase === 'action') {
    const T = E.termOf(g.term), left = d.action * 60 - since, k = 12 / d.action; // 行動が短いほど、たくさん動く
    // GMの代わりの判定：届いてから少したった写真を、早い順に
    const pend = (await db("SELECT * FROM subs WHERE game = ? AND term = ? AND state = 'pending' ORDER BY at", g.id, g.term).all()).results;
    for (const s of pend) {
      if (t - s.at < (P[s.player].bot ? 12 : 6) * SEC) continue;
      const ok = !P[s.player].bot || s.kind !== 'odai' || Math.random() < 0.85;
      try { await E.judge(env, g, s.id, ok, ok ? '' : pick(NG_NOTES)); changed = true; } catch { /* 先の写真が残っているときは次の回に */ }
    }
    const active = (await db("SELECT * FROM sabotage WHERE game = ? AND term = ? AND state = 'active'", g.id, g.term).all()).results;
    const open = (await db("SELECT no FROM odai WHERE game = ? AND term = ? AND state = 'open'", g.id, g.term).all()).results;
    const pendSet = new Set(pend.filter(s => s.kind === 'odai').map(s => s.team + ':' + s.ref));
    const up = async (r, kind, ref) => { try { await E.upload(env, g, P[r.player], kind, ref, null); changed = true; } catch { /* 締め切りや重複は気にしない */ } };
    for (const tm of ['A', 'B', 'C']) {
      const mine = bots.filter(r => r.team === tm);
      if (!mine.length) continue;
      // 緊急任務が出ていたら、まずそれを片付ける
      const z = active.find(x => x.team === tm);
      if (z) { if (!pend.some(s => s.kind === 'kinkyu' && s.ref === z.id) && chance(0.04 * k, dt)) await up(pick(mine), 'kinkyu', z.id); continue; }
      if (!active.length && open.length && chance(0.02 * k, dt)) {
        const cand = open.filter(o => !pendSet.has(tm + ':' + o.no));
        if (cand.length) await up(pick(mine), 'odai', pick(cand).no);
      }
      // 確保写真は終わりが近づいてから
      if (left < d.action * 60 * 0.25 && chance(0.03 * k, dt)) {
        const has = await db('SELECT 1 FROM kakuho WHERE game = ? AND term = ? AND team = ?', g.id, g.term, tm).first();
        if (!has) {
          const human = roles.find(r => r.team === tm && !P[r.player].bot);
          // 人が入っているチームは、残り1割まで待つ
          if (!human || left < d.action * 60 * 0.1) await up(pick(mine), 'kakuho', null);
        }
      }
    }
    // 接触：枠の時間に入ったら、コンピューターの役職の人はだいたい成功する
    const done = (await db('SELECT role, slot, player FROM contacts WHERE game = ? AND term = ?', g.id, g.term).all()).results;
    const min = since / 60, scale = d.action / 60;
    for (const [role, c] of Object.entries(T.contacts)) for (const x of c.slots) {
      if (min < x.from * scale || min > x.to * scale) continue;
      for (const r of bots.filter(b => b.role === role)) {
        if (done.some(k => k.role === role && k.slot === x.n && k.player === r.player)) continue;
        if (chance(0.06 * k, dt) && Math.random() < 0.85) { await E.contact(env, g, role, x.n, r.player); changed = true; }
      }
    }
    // 妨害：権利を持ったら、しばらくして使う
    const rights = (await db('SELECT DISTINCT player FROM rights WHERE game = ? AND term = ? AND used_at IS NULL', g.id, g.term).all()).results;
    for (const { player } of rights) if (P[player].bot && left > 60 && chance(0.012 * k, dt)) { try { await E.sabotage(env, g, P[player]); changed = true; } catch { /* 行動が終わった */ } }
    // 張り込み：内通者がときどき撮る
    const H = (await db('SELECT id, team FROM harikomi WHERE game = ? AND term = ? AND done IS NULL', g.id, g.term).all()).results;
    for (const r of bots.filter(b => b.role === '内通者')) if (H.length && chance(0.004 * k, dt) && !pend.some(s => s.kind === 'harikomi')) await up(r, 'harikomi', pick(H).id);
  }

  if (g.phase === 'meeting' || g.phase === 'vote') {
    const voted = new Set((await db('SELECT player FROM votes WHERE game = ? AND term = ?', g.id, g.term).all()).results.map(v => v.player));
    for (const r of bots) {
      if (voted.has(r.player) || !chance(0.08, dt)) continue;
      await botVote(env, g, P[r.player], r, roles);
      changed = true;
    }
    await scoreAll(env, g, true);
  }
  return changed;
}

// 場面を進める前に、コンピューターがまだやっていないことを済ませる（飛ばしたときも結果がそれらしくなるように）
async function catchUp(env, g, next) {
  const db = (sql, ...a) => env.DB.prepare(sql).bind(...a);
  const players = (await db('SELECT * FROM players WHERE game = ?', g.id).all()).results;
  const P = Object.fromEntries(players.map(p => [p.id, p]));
  const roles = (await db('SELECT * FROM roles WHERE game = ? AND term = ? AND role IS NOT NULL', g.id, g.term).all()).results;
  if (g.phase === 'action' && next === 'meeting') {
    for (const tm of ['A', 'B', 'C']) {
      const has = await db('SELECT 1 FROM kakuho WHERE game = ? AND term = ? AND team = ?', g.id, g.term, tm).first();
      const bot = roles.find(r => r.team === tm && P[r.player].bot);
      if (!has && bot) await E.upload(env, g, P[bot.player], 'kakuho', null, null).catch(() => {});
    }
  }
  if (next === 'result') {
    const voted = new Set((await db('SELECT player FROM votes WHERE game = ? AND term = ?', g.id, g.term).all()).results.map(v => v.player));
    const g2 = g.phase === 'vote' || g.phase === 'meeting' ? g : { ...g, phase: 'vote' };
    for (const r of roles) if (P[r.player].bot && !voted.has(r.player)) await botVote(env, g2, P[r.player], r, roles);
    await scoreAll(env, g);
  }
}
async function botVote(env, g, p, r, roles) {
  const M = roles.filter(x => x.team === r.team);
  // 4割くらいは正解を当てる
  const guess = role => { const h = M.find(x => x.role === role); return Math.random() < 0.4 && h ? h.player : pick(M.filter(x => x.player !== r.player)).player; };
  await E.vote(env, g, p, { s: guess('内通者'), b: guess('密使'), t: guess('蜃気楼') });
}

// 確保写真の採点（GMの代わり）。答えの20項目から、それらしい数だけ当たりにする
async function scoreAll(env, g, onlyBots = false) {
  const T = E.termOf(g.term);
  const ks = (await env.DB.prepare('SELECT k.team, k.score, s.player FROM kakuho k JOIN subs s ON s.id = k.sub WHERE k.game = ? AND k.term = ?').bind(g.id, g.term).all()).results;
  for (const k of ks) {
    if (k.score != null) continue;
    const p = await env.DB.prepare('SELECT bot FROM players WHERE id = ?').bind(k.player).first();
    if (onlyBots && !p.bot) continue;
    const n = 6 + Math.floor(Math.random() * 9);
    const nos = T.checks.map(c => c.no).sort(() => Math.random() - 0.5).slice(0, n);
    await E.scoreKakuho(env, g, k.team, nos);
  }
}

// デモを遊んでいる人のための近道
export async function demoAction(env, g, p, type, b) {
  if (!g.demo) throw new E.Bad('この操作はできません', 403);
  if (type === 'demoSkip') {
    const next = { setup: 'brief', brief: 'action', action: 'meeting', meeting: 'vote', vote: 'result', result: g.term < E.content.terms.length ? 'brief' : 'end' }[g.phase];
    if (!next) throw new E.Bad('ゲームは終わっています');
    await catchUp(env, g, next);
    await E.phase(env, g, next);
    return {};
  }
  if (type === 'demoContact') {
    const r = await env.DB.prepare('SELECT role FROM roles WHERE game = ? AND term = ? AND player = ?').bind(g.id, g.term, p.id).first();
    await E.contact(env, g, r.role, Number(b.slot), p.id);
    return {};
  }
  throw new E.Bad('この操作はできません', 403);
}
