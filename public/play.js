// 参加者の個人ページ（/p/<鍵>）
(() => {
const { esc, $, chip, team: teamChip } = G;
let S = null, tab = G.store.get('tab:' + G.key, 'now'), roleOpen = false;
const seenKey = 'seen:' + G.key;
let seen = G.store.get(seenKey, 0), shownSeen = seen;

const TABS = [
  { id: 'now', ic: '◎', label: 'いま' },
  { id: 'clue', ic: '✉', label: '届いたもの' },
  { id: 'role', ic: '◆', label: '役職' },
  { id: 'res', ic: '≡', label: '結果' },
];

function render() {
  if (!S) return;
  if (S.error) { G.patch($('#main'), `<div class="empty"><h1>ページが見つかりません</h1><p>GMから届いたURLをもう一度開いてください。</p></div>`); $('#tabs').innerHTML = ''; return; }
  const g = S.game;
  G.patch($('#bar'), `<span class="pict" aria-hidden="true">?</span><span class="bar-t"><b>${esc(S.me.name)}${S.team ? `　<small style="display:inline">${esc(S.team)}チーム</small>` : ''}</b><small>${g.term ? `ターム${g.term}／${g.terms}　${esc(g.mall)}` : esc(g.title)}</small></span>${G.clockHTML(g)}`);
  const gmk = G.store.get('demo-gm:' + G.key, '');
  G.patch($('#demo'), g.demo ? `<div class="demo-bar">デモです。ほかの15人とGMはコンピューターが動かしています。${g.phase !== 'end' ? `<button class="btn small sign" style="min-height:28px;padding:0 10px;margin-left:6px;border-color:var(--on-sign)" type="button" data-act="skip">次の場面へ進める</button>` : ''}${gmk ? ` <a href="/gm/${esc(gmk)}" target="_blank" rel="noopener">GM手帳を見る</a>` : ''}</div>` : '');
  // 「届いたもの」を開いたら既読にする。新着の印は、開いた時点で未読だったものに付ける
  if (tab === 'clue' && S.inbox.length && S.inbox[0].id > seen) { shownSeen = seen; seen = S.inbox[0].id; G.store.set(seenKey, seen); }
  const unread = S.inbox.filter(m => m.id > seen).length;
  G.patch($('#tabs'), TABS.map(t => `<button type="button" data-tab="${t.id}"${t.id === tab ? ' aria-current="page"' : ''}><span class="ic" aria-hidden="true">${t.ic}</span>${t.label}${t.id === 'clue' && unread ? `<span class="badge">${unread}<span class="vis">件の新着</span></span>` : ''}</button>`).join(''));
  const f = { now, clue, role, res }[tab] || now;
  G.patch($('#main'), f());
}

// ---------- いま ----------
function alerts() {
  if (!S.sabotage?.length) return '';
  return S.sabotage.map(z => {
    const mine = z.team === S.team, pend = S.subs.some(x => x.kind === 'kinkyu' && x.ref === z.id && x.state === 'pending');
    return `<div class="card alert" role="alert"><h3>緊急任務：${esc(z.team)}チーム</h3><p>${esc(z.floor)}階で、${esc(z.team)}チームの3人以上で写れ。写真が認められるまで、<b>全チーム</b>お題を獲得できません。</p>
    ${mine ? (pend ? '<p class="sub">写真は判定待ちです。</p>' : `<button class="btn ng wide" type="button" data-up="kinkyu" data-ref="${z.id}">緊急任務の写真を撮って出す</button>`) : ''}</div>`;
  }).join('');
}
function now() {
  const g = S.game;
  if (g.phase === 'setup') return `<h1>まもなく始まります</h1><div class="card"><p>あなたのコードネームは <b>${esc(S.me.name)}</b> です。</p><p>GMの合図でターム1が始まると、この画面にチームと役職が出ます。このページはあなた専用です。URLは人に見せないでください。</p></div>${schedule()}${howto()}`;
  if (S.rest) return `<h1>このタームはお休みです</h1><p>次のタームを待ってください。</p>`;
  if (g.phase === 'end') return `<h1>おつかれさまでした</h1>${totals()}`;
  if (g.phase === 'result') return termResult(S.res.terms.find(r => r.t === g.term), true);
  const mates = `<div class="card"><div class="hd">${teamChip(S.team)}<span class="sub">${S.mates.length}人</span></div><p style="margin:0">${S.mates.map(m => m.id === S.me.id ? `<b>${esc(m.name)}</b>（あなた）` : esc(m.name)).join('、')}</p></div>`;
  if (g.phase === 'brief') { const at = g.plan?.at?.[g.term]; return `<h1>ターム${g.term}　${esc(S.mall)}</h1>${roleCard()}${mates}<div class="notice">${at ? `行動開始は <b>${G.hm(at)}</b> の予定です。` : ''}GMの合図で行動が始まります。役職の画面で、任務と点数を確かめておいてください。</div>`; }
  if (g.phase === 'meeting' || g.phase === 'vote') return `${voteForm()}${mates}`;
  // 行動中
  const open = S.odai.filter(o => o.state === 'open'), taken = S.odai.filter(o => o.state === 'taken');
  const blocked = S.sabotage.length > 0;
  const mySub = no => S.subs.find(x => x.kind === 'odai' && x.ref === no && x.mine && x.state === 'pending');
  const teamPend = no => S.subs.find(x => x.kind === 'odai' && x.ref === no && x.state === 'pending');
  const lastNg = no => S.subs.find(x => x.kind === 'odai' && x.ref === no && x.mine && (x.state === 'ng'));
  let h = alerts();
  h += `<h1 style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">お題 <span class="sub">獲得 ${S.taken}／残り ${S.left + open.length}</span></h1>`;
  h += open.length ? open.map(o => {
    const p = mySub(o.no) || teamPend(o.no), ng = lastNg(o.no);
    return `<div class="card od"><div class="no">${o.no}</div><div><div class="tt">${esc(o.title)}</div><p class="tx">${esc(o.order)}</p>${o.cond ? `<div class="cd"><b>条件：</b>${esc(o.cond)}</div>` : ''}${o.tags?.length ? `<div class="tags">${o.tags.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}
      ${ng && !p ? `<p class="sub" style="color:var(--ng);margin:6px 0 0">前の写真は認められませんでした${ng.note ? `：${esc(ng.note)}` : ''}</p>` : ''}
      <div class="row" style="margin-top:10px">${p ? `<span class="st pending">判定待ち</span><span class="sub">${p.mine ? 'あなたの写真' : esc(p.name) + 'さんの写真'}をGMが見ています</span>`
        : `<button class="btn" type="button" data-up="odai" data-ref="${o.no}"${blocked ? ' disabled' : ''}>写真を撮って出す</button>${blocked ? '<span class="sub">緊急任務の解除待ち</span>' : ''}`}</div></div></div>`;
  }).join('') : '<p class="empty">いま出ているお題はありません。</p>';
  h += `<h2>確保写真</h2>${S.kakuho ? `<div class="card"><span class="st ok">提出済み</span> <span class="sub">チームの確保写真を出しました。採点は結果発表で。</span></div>`
    : `<div class="card"><p>答えの写真にできるだけ近い1枚を、<b>チームで1回だけ</b>出せます。撮る場所はチームで話し合って決めてください。</p><button class="btn sign wide" type="button" data-up="kakuho">確保写真を撮って出す</button></div>`}`;
  if (taken.length) h += `<h2>獲得されたお題</h2>${taken.map(o => `<div class="card od taken"><div class="no">${o.no}</div><div><div class="tt">${esc(o.title)}</div><div class="row" style="margin-top:4px">${teamChip(o.team)}${o.team === S.team ? '<span class="sub">あなたのチーム</span>' : ''}</div></div></div>`).join('')}`;
  return h + mates;
}
// 開催日と、タームごとの行動開始の予定
function schedule() {
  const p = S.game.plan;
  if (!p?.date && !Object.keys(p?.start || {}).length) return '';
  const d = p.date ? new Date(p.date + 'T00:00:00+09:00') : null;
  return `<h2>予定</h2><div class="card">${d ? `<p><b>${d.getMonth() + 1}月${d.getDate()}日（${'日月火水木金土'[d.getDay()]}）</b>　<span class="sub">各タームの行動開始の時刻</span></p>` : ''}<div class="tw narrow" style="margin:0"><table><tbody>${S.game.malls.map((m, i) => `<tr><td style="white-space:nowrap">ターム${i + 1}</td><td>${esc(m)}</td><td class="num" style="white-space:nowrap"><b>${p.at?.[i + 1] ? G.hm(p.at[i + 1]) : '－'}</b></td></tr>`).join('')}</tbody></table></div></div>`;
}
function howto() {
  return `<h2>遊び方</h2><div class="card"><ol style="margin:0;padding-left:1.2em">
  <li>3チームに分かれてモールを回り、出ているお題の写真を撮って出します。早い者勝ちです。</li>
  <li>GMが認めると、出した人にだけ「手掛かり」か「割符」が届きます。口で伝えるのはOK、画面を見せるのは禁止です。</li>
  <li>手掛かりから「答えの写真」の場所を推理して、チームで1回だけ確保写真を出します。</li>
  <li>チームには内通者・密使・蜃気楼が紛れています。最後に、誰がどの役職かを投票します。</li></ol></div>`;
}

// ---------- 役職 ----------
function roleCard() {
  const r = S.role, I = G.ROLE_INFO[r];
  return `<div class="reveal r-${esc(r)}${roleOpen ? ' open' : ''}" style="margin-bottom:12px"><div class="face" aria-hidden="${roleOpen ? 'false' : 'true'}"><div class="sub">ターム${S.game.term}のあなたの役職</div><div class="big">${esc(r)}</div><p style="margin:6px 0 0">${esc(I.goal)}</p></div>
  <button class="lid" type="button" data-act="reveal"><b>タップして役職を見る</b><span>まわりに画面が見えないようにしてください</span></button></div>`;
}
function role() {
  const g = S.game;
  if (!S.role) return now();
  const r = S.role, I = G.ROLE_INFO[r];
  let h = `<h1>役職</h1>${roleCard()}`;
  if (!roleOpen) return h + `<p class="sub">役職を開くと、任務と、役職だけに届く情報が出ます。</p>`;
  h += `<div class="card"><h3>点数</h3><ul style="margin:0;padding-left:1.2em">${I.pts.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  if (S.bep) h += `<div class="card hl"><h3>答えの写真の本物の情報（密使だけ）</h3><ul style="margin:0;padding-left:1.2em">${S.bep.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="sub" style="margin:6px 0 0">この3つが確保写真に入るごとに＋2点。</p></div>`;
  if (S.answer) h += `<div class="card hl"><h3>答えの写真（内通者だけ）</h3><div class="photo-big" style="margin:8px 0"><img src="${G.answerImg(g.term)}" alt="答えの写真"></div><p style="margin:0">${esc(S.answer)}</p><p class="sub" style="margin:6px 0 0">チームには見せずに、嘘や誘導で答えから遠ざけてください。</p></div>`;
  if (S.contact) {
    const c = S.contact, t = G.now();
    h += `<div class="card"><h3>GMとの接触</h3><p>決めた時間に決めた場所へ行き、GMに合言葉を直接言ってください。遅れたらその回は失敗です。</p><p>合言葉 <span class="pw">${esc(c.pw)}</span></p>
    ${c.slots.map(x => { const nowIn = x.from && t >= x.from && t <= x.to; return `<div class="slot${x.done ? ' done' : ''}${nowIn ? ' now' : ''}"><span class="tm">${x.n}回目　${x.from ? `${G.hm(x.from)}〜${G.hm(x.to)}` : `開始${x.fromMin}分後〜${x.toMin}分後`}</span><span>${esc(x.place)}${x.done ? '　<span class="st ok">成功</span>' : nowIn ? '　<b>いまの時間です</b>' : ''}${g.demo && nowIn && !x.done ? `<br><button class="btn small" type="button" data-act="democontact" data-slot="${x.n}">（デモ）GMに合言葉を言えたことにする</button>` : ''}</span></div>`; }).join('')}
    <p class="sub" style="margin:8px 0 0">${r === '密使' ? '成功するたびに、自分のチームの公安を1人教えてもらえます。' : r === '蜃気楼' ? '1回目でチームの内通者が分かり、2回目で妨害を1回発動できます。' : '成功するたびに、妨害を1回発動できます。'}接触の結果は「届いたもの」に届きます。</p></div>`;
  }
  if (r === '内通者' || r === '蜃気楼') {
    const can = g.phase === 'action' && S.rights > 0;
    h += `<div class="card${S.rights ? ' hl' : ''}"><h3>妨害</h3><p>使える権利：<b class="num">${S.rights}</b>回</p><p class="sub">発動すると自分のチームに「〇階で3人以上で写れ」という緊急任務が出て、写真が認められるまで全チームがお題を獲得できなくなります。</p>
    <button class="btn ng wide" type="button" data-act="sabotage"${can ? '' : ' disabled'}>妨害を発動する</button></div>`;
  }
  if (S.harikomi) {
    const by = {}; S.harikomi.forEach(x => (by[x.team] ||= []).push(x));
    h += `<div class="card"><h3>張り込み（内通者だけ）</h3><p class="sub">下の瞬間を撮って出すと、写っている人のチームの内通者が妨害を1回発動できます（1人1タームに3回まで）。どのチームの内通者が撮ってもOKです。</p>
    ${Object.entries(by).map(([tm, L]) => `<h3 style="margin-top:12px">${esc(tm)}チームの張り込み${tm === S.team ? '（あなたの権利）' : ''}</h3>${L.map(x => {
      const p = S.subs.find(s => s.kind === 'harikomi' && s.ref === x.id && s.state === 'pending');
      return `<div class="slot"><span>${x.done ? '<span class="st ok">達成</span>' : p ? '<span class="st pending">判定待ち</span>' : `<button class="btn small" type="button" data-up="harikomi" data-ref="${x.id}"${g.phase === 'action' ? '' : ' disabled'}>撮る</button>`}</span><span>${esc(x.target)}さんが${esc(x.action)}瞬間</span></div>`;
    }).join('')}`).join('')}</div>`;
  }
  return h;
}

// ---------- 届いたもの ----------
function clue() {
  const term = S.game.term;
  const rewards = S.inbox.filter(m => m.kind === 'reward' && m.term === term).slice().reverse();
  let h = `<h1>届いたもの</h1>`;
  if (term) h += `<h2 style="margin-top:0">手掛かりと割符（ターム${term}）</h2>${rewards.length ? `<ul class="feed">${rewards.map(item).join('')}</ul>` : '<p class="sub">お題を獲得すると、ここに届きます。届いた内容は口で伝えてOK、画面を見せるのは禁止です。</p>'}`;
  const other = S.inbox.filter(m => !(m.kind === 'reward' && m.term === term));
  h += `<h2>お知らせ</h2>${other.length ? `<ul class="feed">${other.map(item).join('')}</ul>` : '<p class="sub">まだありません。</p>'}`;
  return h;
}
function item(m) {
  return `<li class="${esc(m.kind)}${m.id > shownSeen ? ' new' : ''}"><span class="k"><span>ターム${m.term}</span><span>${G.hm(m.at)}</span></span><b>${esc(m.title)}</b>${esc(m.body)}</li>`;
}

// ---------- 投票 ----------
function voteForm() {
  const g = S.game, v = S.vote || {}, own = G.ROLE_KEY[S.role];
  const opts = (k) => `<option value="">選んでください</option>${S.mates.map(m => `<option value="${m.id}"${v[k] === m.id ? ' selected' : ''}>${esc(m.name)}${m.id === S.me.id ? '（自分）' : ''}</option>`).join('')}`;
  const fields = [['s', '内通者'], ['b', '密使'], ['t', '蜃気楼']].filter(([k]) => k !== own);
  return `<h1>${g.phase === 'meeting' ? '作戦会議と投票' : '投票'}</h1>
  <p>${g.phase === 'meeting' ? 'チームで話し合って、' : ''}自分のチームの中から、それぞれの役職だと思う人を1人ずつ選んでください。多数決ではなく、一人ひとりの回答を採点します。${own ? `自分の役職（${esc(S.role)}）の欄は、自分の名前が入ります。` : ''}</p>
  <form class="card" id="vote">${fields.map(([k, r]) => `<label class="f" for="v-${k}">${chip(r)} だと思う人</label><select id="v-${k}" name="${k}">${opts(k)}</select>`).join('')}
  <div class="row" style="margin-top:14px"><button class="btn wide" type="submit">${S.vote ? '投票を書き直す' : '投票する'}</button></div>${S.vote ? '<p class="sub" style="margin:8px 0 0">投票済みです。結果発表まで書き直せます。</p>' : ''}</form>`;
}

// ---------- 結果 ----------
function termResult(r, head) {
  if (!r) return '<p class="empty">結果はまだありません。</p>';
  const T = r.teams, mine = r.players.find(p => p.id === S.me.id);
  let h = head ? `<h1>ターム${r.t}の結果</h1>` : `<h2>ターム${r.t}</h2>`;
  if (head && mine) h += `<div class="card hl"><div class="hd">${chip(mine.role)}${teamChip(mine.team)}</div><p style="margin:0">あなたの点数 <b style="font-size:28px" class="num">${mine.pt}</b> 点</p></div>`;
  h += `<div class="photo-big" style="margin:8px 0"><img src="${G.answerImg(r.t)}" alt="ターム${r.t}の答えの写真" loading="lazy"></div>`;
  h += `<div class="tw narrow"><table><thead><tr><th>チーム</th><th class="num">確保点</th><th class="num">密使の3項目</th><th class="num">妨害</th></tr></thead><tbody>${T.map(x => `<tr${x.top ? ' class="first"' : ''}><td>${esc(x.team)}${x.top ? '　トップ賞' : ''}</td><td class="num total">${x.kakuho}</td><td class="num">${x.bep3}／3</td><td class="num">${x.bougai}</td></tr>`).join('')}</tbody></table></div>`;
  h += `<div class="tw"><table><thead><tr><th>名前</th><th>チーム</th><th>役職</th><th>投票（内通者／密使／蜃気楼）</th><th class="num">点</th></tr></thead><tbody>${r.players.map(p => `<tr${p.id === S.me.id ? ' class="me"' : ''}><td><b>${esc(p.name)}</b></td><td>${esc(p.team)}</td><td>${chip(p.role)}</td><td class="sub">${p.voted ? `${esc(p.vote.s) || '－'}／${esc(p.vote.b) || '－'}／${esc(p.vote.t) || '－'}` : '未投票'}</td><td class="num total">${p.pt}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}
function totals() {
  const L = S.res?.totals || [];
  if (!L.length) return '<p class="empty">結果はまだありません。</p>';
  let rank = 0, prev = null;
  return `<div class="tw"><table><thead><tr><th class="num">順位</th><th>名前</th>${(S.res.terms).map(r => `<th class="num">T${r.t}</th>`).join('')}<th class="num">合計</th></tr></thead><tbody>${L.map((x, i) => { if (x.sum !== prev) { rank = i + 1; prev = x.sum; } return `<tr class="${rank === 1 ? 'first' : ''}${x.id === S.me.id ? ' me' : ''}"><td class="num">${rank}</td><td><b>${esc(x.name)}</b>${rank === 1 && S.game.phase === 'end' ? '　MVP' : ''}</td>${S.res.terms.map(r => `<td class="num">${x.by[r.t] ?? '－'}</td>`).join('')}<td class="num total">${x.sum}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function res() {
  const R = S.res?.terms || [];
  if (!R.length) return `<h1>結果</h1><p class="empty">タームが終わると、ここに正体と点数が出ます。</p>`;
  return `<h1>結果</h1><h2 style="margin-top:0">合計</h2>${totals()}${R.slice().reverse().map(r => termResult(r, false)).join('')}`;
}

// ---------- 操作 ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-tab]');
  if (t) { if (tab === 'clue') shownSeen = seen; tab = t.dataset.tab; G.store.set('tab:' + G.key, tab); render(); window.scrollTo(0, 0); return; }
  const a = e.target.closest('[data-act]');
  if (a?.dataset.act === 'reveal') { roleOpen = true; render(); return; }
  if (a?.dataset.act === 'skip') { try { await G.act('demoSkip'); G.nudge(); } catch (err) { G.toast(err.message, true); } return; }
  if (a?.dataset.act === 'democontact') { try { await G.act('demoContact', { slot: Number(a.dataset.slot) }); G.toast('接触に成功しました。「届いたもの」を見てください'); G.nudge(); } catch (err) { G.toast(err.message, true); } return; }
  if (a?.dataset.act === 'sabotage') {
    if (!confirm('妨害を発動しますか？\n自分のチームに緊急任務が出て、写真が認められるまで全チームがお題を獲得できなくなります。')) return;
    try { await G.act('sabotage'); G.toast('妨害を発動しました'); G.nudge(); } catch (err) { G.toast(err.message, true); }
    return;
  }
  const u = e.target.closest('[data-up]');
  if (u) {
    const kind = u.dataset.up, ref = u.dataset.ref ?? null;
    if (kind === 'kakuho' && !confirm('確保写真はチームで1回だけです。\nチームで決めた1枚を撮りますか？')) return;
    try { const r = await G.upload(kind, ref); if (r) { G.toast(kind === 'kakuho' ? '確保写真を出しました' : '送りました。GMの判定を待ってください'); G.nudge(); } }
    catch (err) { G.toast(err.message, true); }
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'vote') return;
  e.preventDefault();
  const f = new FormData(e.target), x = Object.fromEntries(f.entries());
  try { await G.act('vote', x); G.toast('投票しました'); G.nudge(); } catch (err) { G.toast(err.message, true); }
});

let lastAlert = G.store.get('alert:' + G.key, 0);
G.poll(d => {
  // 新しい緊急任務や手掛かりが届いたら、ふるえて知らせる
  const top = d.inbox?.find(m => m.kind === 'alert' || m.kind === 'reward' || m.kind === 'contact');
  if (top && top.id > lastAlert) { if (lastAlert) try { navigator.vibrate?.([120, 60, 120]); } catch { /* 対応していない端末 */ } lastAlert = top.id; G.store.set('alert:' + G.key, lastAlert); }
  if (S && d.game && S.game && d.game.term !== S.game.term) roleOpen = false;
  // 場面が変わったら「いま」の画面に戻す（行動開始や結果発表を見逃さないように）
  if (S?.game && d.game && (d.game.phase !== S.game.phase || d.game.term !== S.game.term)) { tab = 'now'; G.store.set('tab:' + G.key, tab); window.scrollTo(0, 0); }
  // 入力中の投票を消さない
  if (S && document.activeElement?.closest?.('#vote')) { S = d; return; }
  S = d; render();
});
// 接触の「いまの時間です」など、時刻で変わる表示のために時々描き直す
setInterval(() => { if (!document.activeElement?.closest?.('form, select')) render(); }, 20000);
})();
