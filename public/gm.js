// GM手帳（/gm/<鍵>）
(() => {
const { esc, $, chip, team: teamChip } = G;
let S = null, tab = G.store.get('gtab:' + G.key, 'flow');
const NEXT = {
  setup: () => ['brief', 'ターム1の役職を発表する', 'チームと役職が全員の個人ページに出ます。'],
  brief: () => ['action', `行動を開始する（${S.game.dur.action}分）`, 'お題が3つ公開され、時間が動き出します。'],
  action: () => ['meeting', '行動を終えて作戦会議へ', '写真の投稿を締め切ります。'],
  meeting: () => ['vote', '投票の時間へ', ''],
  vote: () => ['result', '結果を発表する', '正体と点数が全員に公開されます。'],
  result: () => S.game.term < S.game.terms ? ['brief', `ターム${S.game.term + 1}の役職を発表する`, ''] : ['end', 'ゲームを終える', '合計点とMVPが出ます。'],
  end: () => null,
};
const NG = ['条件が写っていない', '場所が違う', 'ぶれて見えない', '人数が足りない'];

function tabs() {
  const pend = (S.subs || []).filter(x => x.state === 'pending' && x.kind !== 'kakuho').length;
  const L = [['flow', '進行'], ['judge', '判定', pend], ['contact', '接触'], ['odai', 'お題'], ['sab', '妨害・張り込み'], ['kakuho', '確保の採点'], ['people', '参加者'], ['res', '結果']];
  return L.map(([id, l, n]) => `<button type="button" data-tab="${id}"${id === tab ? ' aria-current="page"' : ''}>${l}${n ? `<span class="badge">${n}</span>` : ''}</button>`).join('');
}
function render() {
  if (!S) return;
  if (S.error) { G.patch($('#main'), `<div class="empty"><h1>${/GMではありません/.test(S.error) ? 'このタームのGMではありません' : 'ページが見つかりません'}</h1><p>${/GMではありません/.test(S.error) ? `GMを担当するタームになると開けます。<a href="/p/${esc(G.key)}">自分のページへ戻る</a>` : ''}</p></div>`); return; }
  const g = S.game;
  G.patch($('#bar'), `<span class="pict" aria-hidden="true">?</span><span class="bar-t"><b>GM手帳</b><small>${esc(g.title)}${g.term ? `　ターム${g.term}／${g.terms} ${esc(g.mall)}` : ''}</small></span>${G.clockHTML(g)}`);
  G.patch($('#demo'), g.demo ? demoBar() : '');
  G.patch($('#tabs'), tabs());
  const f = { flow, judge, contact, odai, sab, kakuho, people, res }[tab] || flow;
  const y = window.scrollY;
  G.patch($('#main'), step() + f());
  window.scrollTo(0, y);
}
function step() {
  const n = NEXT[S.game.phase]();
  const warn = [];
  if (S.game.phase === 'vote' || S.game.phase === 'meeting') {
    const un = S.kakuho?.filter(k => k.sub && k.score == null).map(k => k.team) || [];
    if (un.length) warn.push(`${un.join('・')}チームの確保写真が未採点です（「確保の採点」で付けます）`);
    const cur = S.roles[S.game.term] || {}, nv = Object.values(cur).filter(r => r.role && !S.voted.includes(r.player)).length;
    if (nv) warn.push(`未投票 ${nv}人`);
  }
  if (S.game.phase === 'action') { const p = S.subs.filter(x => x.state === 'pending' && x.kind !== 'kakuho').length; if (p) warn.push(`判定待ちが ${p}件 あります`); }
  const by = S.by ? `<div class="notice">あなた（${esc(S.by.name)}）はターム${S.game.term}のGMです。${S.gms?.[S.game.term]?.length > 1 ? `ほかのGM：${S.gms[S.game.term].filter(id => id !== S.by.id).map(id => esc(S.players.find(p => p.id === id)?.name)).join('、')}。判定や接触は誰が押しても同じように記録されます。` : ''}<a href="/p/${esc(G.key)}">自分のページ</a></div>` : '';
  return by + contactMemo() + `<div class="card" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><div><div class="sub">いま：${G.PHASE[S.game.phase]}${S.game.term ? `（ターム${S.game.term}）` : ''}</div>${warn.map(w => `<div style="color:var(--ng);font-size:14px;font-weight:700">${esc(w)}</div>`).join('')}${n?.[2] ? `<div class="sub">${esc(n[2])}</div>` : ''}</div>
  ${n ? `<button class="btn sign" type="button" data-phase="${n[0]}" data-label="${esc(n[1])}">${esc(n[1])} →</button>` : '<span class="sub">ゲームは終わりました</span>'}</div>`;
}

// 接触メモ：いま（なければ次）の接触の時刻・場所・合言葉・来る人。どのタブにも出す
function contactMemo() {
  const ph = S.game.phase;
  if ((ph !== 'brief' && ph !== 'action') || !S.contacts) return '';
  const t = G.now(), L = [];
  for (const c of S.contacts) for (const x of c.slots) L.push({ ...x, role: c.role, pw: c.pw });
  L.sort((a, b) => a.fromMin - b.fromMin);
  const left = L.filter(x => !(x.to && x.to < t) && x.who.some(w => !w.done));
  if (!left.length) return '';
  const [cur, next] = left, nowIn = cur.from && t >= cur.from && t <= cur.to;
  const when = x => x.from ? `${G.hm(x.from)}〜${G.hm(x.to)}` : `行動開始の${x.fromMin}〜${x.toMin}分後`;
  const until = cur.from && !nowIn ? `（あと${Math.max(0, Math.ceil((cur.from - t) / 60000))}分）` : '';
  return `<div class="card r-${esc(cur.role)}${nowIn ? ' hl' : ''}" style="border-left:6px solid var(--rc)" data-tour="memo">
  <div class="hd"><b>${nowIn ? 'いまの接触' : '次の接触'}</b>${chip(cur.role)}<span>${cur.n}回目</span><span class="num" style="font-weight:700;color:var(--harbor)">${when(cur)}</span>${nowIn ? '<span class="st ok">受付中</span>' : `<span class="sub">${until}</span>`}</div>
  <p style="margin:0 0 6px;font-size:17px"><b>${esc(cur.place)}</b>　合言葉 <span class="pw">${esc(cur.pw)}</span></p>
  <div class="row">${cur.who.map(w => w.done ? `<span class="btn ghost small" aria-disabled="true">✓ ${esc(w.name)}（${w.team}）</span>` : `<button class="btn small" type="button" data-contact="${esc(cur.role)}" data-slot="${cur.n}" data-player="${w.id}" data-name="${esc(w.name)}"${ph === 'action' ? '' : ' disabled'}>${esc(w.name)}（${w.team}）に会えた</button>`).join('')}</div>
  ${next ? `<p class="sub" style="margin:8px 0 0">その次：${when(next)}　${esc(next.role)}・${next.n}回目　${esc(next.place)}（合言葉「${esc(next.pw)}」）</p>` : ''}</div>`;
}

// デモの案内。GMデモでは行動中の時間を飛ばせる
function demoBar() {
  const g = S.game, B = (to, l) => `<button class="btn small sign" style="min-height:28px;padding:0 10px;border-color:var(--on-sign)" type="button" data-shift="${to}">${l}</button>`;
  if (g.mode === 'tour-gm') return `<div class="demo-bar">GM・画面の案内（デモ）。参加者16人はコンピューターです。</div>`;
  if (g.mode === 'try-gm') return `<div class="demo-bar">GM・やってみる（デモ）。参加者16人はコンピューターです。時間は気にせず、課題の順に進めてください。</div>`;
  if (g.mode !== 'gm') return `<div class="demo-bar">デモのGM手帳です。参加者とGMの操作はコンピューターが動かしています。</div>`;
  return `<div class="demo-bar">GMデモです。16人の参加者はコンピューターです。判定・接触・採点・進行はあなたがやります。${g.phase === 'action' ? `<span class="row" style="justify-content:center;gap:6px;margin-top:4px">${B('5m', '5分進める')}${B('contact', '次の接触まで進める')}${B('end', '行動の終わりまで進める')}</span>` : ''}${g.phase === 'action' ? '<span style="display:block;font-weight:400">接触の時間になったら、合言葉を言いに来たことにして名前を押してください。</span>' : ''}</div>`;
}

// ---------- 進行 ----------
// これから来る接触（いま待っている枠を含む）
function nextContact() {
  const cur = S.schedule?.find(x => x.t === S.game.term);
  if (!cur) return null;
  return cur.contacts.find(x => x.to && x.to > G.now()) || null;
}
const STEPS = [['brief', '役職発表'], ['action', '行動'], ['meeting', '作戦会議'], ['vote', '投票'], ['result', '結果発表']];
function todo() {
  const g = S.game, ph = g.phase, link = (t, l) => `<button class="btn ghost small" type="button" data-tab="${t}">${l}</button>`;
  const planned = !!(g.plan.date && Object.keys(g.plan.start).length === g.terms);
  const pend = (S.subs || []).filter(x => x.state === 'pending' && x.kind !== 'kakuho').length;
  const cur = S.roles[g.term] || {}, nv = Object.values(cur).filter(r => r.role && !S.voted?.includes(r.player)).length;
  const unscored = (S.kakuho || []).filter(k => k.sub && k.score == null).length;
  const nx = nextContact();
  const L = {
    setup: [[planned, '開催日と、各タームの行動開始の時刻を入れる（このページの下の「予定」）。接触の時刻はここから自動で決まります。'],
      [false, `「参加者」で、全員に個人ページのURLを送る。 ${link('people', '参加者を開く')}`],
      [false, '全員がページを開けたら、上の「ターム1の役職を発表する」を押す。']],
    brief: [[true, '全員の個人ページに、チームと役職が届きました。内通者・密使・蜃気楼には、接触の時間・場所・合言葉も届いています。'],
      [false, 'チームごとに集まってもらい、行動開始の時刻になったら上の「行動を開始する」を押す。']],
    action: [[!pend, `「判定」に届く写真を、上から順に「獲得」か「却下」にする${pend ? `（いま ${pend}件）` : ''}。 ${link('judge', '判定を開く')}`],
      [false, `接触の時刻に、その場所で待つ。合言葉を言えた人の名前を「接触」で押す${nx ? `（次は ${G.hm(nx.from)} ${esc(nx.place)}）` : ''}。 ${link('contact', '接触を開く')}`],
      [false, '妨害が出ると、緊急任務の写真も「判定」に届きます。'],
      [false, '時間になったら、上の「行動を終えて作戦会議へ」を押す。']],
    meeting: [[!unscored, `「確保の採点」で、各チームの確保写真を20項目でチェックする${unscored ? `（未採点 ${unscored}チーム）` : ''}。 ${link('kakuho', '採点を開く')}`],
      [!nv, `参加者は会議しながら投票できます${nv ? `（未投票 ${nv}人）` : ''}。`],
      [false, '会議の時間が終わったら、上の「投票の時間へ」を押す。']],
    vote: [[!nv, `まだ投票していない人に声をかける${nv ? `（未投票 ${nv}人）` : ''}。 ${link('people', '参加者を開く')}`],
      [!unscored, '確保の採点を全部終わらせる。'],
      [false, '上の「結果を発表する」を押す。']],
    result: [[true, '全員の画面に、正体・点数・答えの写真が出ました。答えの場所を口で説明すると盛り上がります。'],
      [false, g.term < g.terms ? `次のモールへ移動して、上の「ターム${g.term + 1}の役職を発表する」を押す。` : '上の「ゲームを終える」を押すと、合計点とMVPが出ます。']],
    end: [[true, 'おつかれさまでした。合計点は「結果」にあります。']],
  }[ph] || [];
  return `<ol class="checks" style="gap:8px">${L.map(([done, text]) => `<li style="display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:start"><span aria-hidden="true" style="color:${done ? 'var(--ok)' : 'var(--sub)'};font-weight:700">${done ? '✓' : '・'}</span><span>${text}</span></li>`).join('')}</ol>`;
}
function flow() {
  const g = S.game, idx = STEPS.findIndex(x => x[0] === g.phase);
  let h = `<h1>進行${g.term ? ` <span class="sub">ターム${g.term}　${esc(g.mall)}</span>` : ''}</h1>`;
  if (g.term) h += `<ol class="row" style="list-style:none;padding:0;margin:0 0 12px;gap:4px">${STEPS.map(([id, l], i) => `<li class="st ${i < idx ? 'ok' : i === idx ? '' : 'pending'}" style="${i === idx ? 'background:var(--sign);color:var(--on-sign);border-color:var(--sign);' : ''}font-size:13px;padding:2px 10px">${i < idx ? '✓ ' : ''}${l}</li>`).join('<li aria-hidden="true" class="sub">→</li>')}</ol>`;
  h += script();
  h += plan();
  return h;
}

// 台本：このタームでGMがやることを、時刻の順に並べる。終わったものに ✓、いまの行に「いまここ」とボタン
function script() {
  const g = S.game, ph = g.phase, t = g.term || 1, P = ['setup', 'brief', 'action', 'meeting', 'vote', 'result', 'end'];
  const at = x => P.indexOf(ph) > P.indexOf(x) || (ph === 'result' && x !== 'result' && g.term) ;
  const sch = S.schedule?.find(x => x.t === t), start = sch?.start, dur = g.dur;
  const hm = ms => ms ? G.hm(ms) : '';
  const pend = (S.subs || []).filter(x => x.state === 'pending' && x.kind !== 'kakuho').length;
  const L = [];
  const add = (time, text, done, btn = '') => L.push({ time, text, done, btn });
  const phaseBtn = (to, label) => `<button class="btn sign small" type="button" data-phase="${to}" data-label="${esc(label)}">${esc(label)}</button>`;
  const before = g.phase === 'setup' || (g.phase === 'result' && g.term < g.terms);
  const T = before && g.phase === 'result' ? g.term + 1 : t;
  if (before) {
    if (g.phase === 'setup') {
      const planned = !!(g.plan.date && Object.keys(g.plan.start).length === g.terms);
      add('', '開催日と、各タームの行動開始の時刻を入れる（下の「予定」）。接触の時刻はここから決まる', planned);
      add('', '全員に個人ページのURLを送る（LINEの個別トークなど）', false, S.by ? '' : '<button class="btn ghost small" type="button" data-tab="people">参加者を開く</button>');
    }
    add('', `ターム${T}のGMと休みの人を決める（「参加者」の表で「GM」「休み」を選び、割り振り直す）。GMは何人でもよい`, false, S.by ? '' : '<button class="btn ghost small" type="button" data-tab="people">参加者を開く</button>');
    add(hm(S.schedule?.find(x => x.t === T)?.start && S.schedule.find(x => x.t === T).start - 5 * 60000), `ターム${T}の役職を発表する（全員のページにチームと役職が出る）`, false, phaseBtn('brief', `ターム${T}の役職を発表する`));
  } else {
    add('', '役職を発表する', true);
    add(hm(start), `行動を開始する（${dur.action}分）。お題が3つ公開される`, ph !== 'brief', ph === 'brief' ? phaseBtn('action', '行動を開始する') : '');
    if (ph === 'action') add('ずっと', `届いた写真を判定する${pend ? `（いま ${pend}件）` : '（いまはなし）'}`, !pend, '<button class="btn ghost small" type="button" data-tab="judge">判定を開く</button>');
    const slots = [];
    for (const c of S.contacts || []) for (const x of c.slots) slots.push({ ...x, role: c.role, pw: c.pw });
    slots.sort((a, b) => a.fromMin - b.fromMin);
    for (const x of slots) {
      const done = x.who.every(w => w.done) || (x.to && x.to < G.now()) || P.indexOf(ph) > P.indexOf('action');
      const now = ph === 'action' && x.from && G.now() >= x.from - 60000 && G.now() <= x.to;
      add(x.from ? `${hm(x.from)}〜${hm(x.to)}` : `開始${x.fromMin}分後`, `${esc(x.place)}で<b>${esc(x.role)}</b>を待つ（${x.n}回目・合言葉「${esc(x.pw)}」）${x.who.length ? `：${x.who.map(w => `${w.done ? '✓' : ''}${esc(w.name)}`).join('、')}` : ''}`, done,
        now ? x.who.filter(w => !w.done).map(w => `<button class="btn small" type="button" data-contact="${esc(x.role)}" data-slot="${x.n}" data-player="${w.id}" data-name="${esc(w.name)}">${esc(w.name)}に会えた</button>`).join(' ') : '');
    }
    add(hm(start && start + dur.action * 60000), '行動を終える（写真の投稿を締め切る）', at('action'), ph === 'action' ? phaseBtn('meeting', '行動を終えて作戦会議へ') : '');
    const un = (S.kakuho || []).filter(k => k.sub && k.score == null).length;
    add('', `確保写真を20項目で採点する${un ? `（未採点 ${un}チーム）` : ''}`, ph !== 'action' && ph !== 'brief' && !un, (ph === 'meeting' || ph === 'vote') && un ? '<button class="btn ghost small" type="button" data-tab="kakuho">採点を開く</button>' : '');
    add(hm(start && start + (dur.action + dur.meeting) * 60000), `作戦会議（${dur.meeting}分）が終わったら、投票の時間へ`, at('meeting'), ph === 'meeting' ? phaseBtn('vote', '投票の時間へ') : '');
    const nv = Object.values(S.roles[g.term] || {}).filter(r => r.role && r.role !== 'GM' && !S.voted?.includes(r.player)).length;
    add(hm(start && start + (dur.action + dur.meeting + dur.vote) * 60000), `全員の投票がそろったら、結果を発表する${ph === 'vote' && nv ? `（未投票 ${nv}人）` : ''}`, at('vote'), ph === 'vote' ? phaseBtn('result', '結果を発表する') : '');
    add('', g.term < g.terms ? '答えの場所を口で説明して、次のモールへ移動する' : '「ゲームを終える」で合計点とMVPを出す', ph === 'end', ph === 'result' && g.term >= g.terms ? phaseBtn('end', 'ゲームを終える') : '');
  }
  const cur = L.findIndex(x => !x.done);
  return `<h2>台本 <span class="sub">ターム${T}　上から順にやります</span></h2><ol class="card" data-tour="script" style="list-style:none;padding:6px 14px;margin:0 0 12px">${L.map((x, i) => `<li style="display:grid;grid-template-columns:20px 96px 1fr;gap:8px;padding:9px 0;border-top:${i ? '1px dashed var(--line)' : '0'};${i === cur ? 'background:var(--warn-bg);margin:0 -14px;padding:9px 14px;' : ''}${x.done ? 'color:var(--sub);' : ''}">
    <span style="font-weight:700;color:${x.done ? 'var(--ok)' : 'var(--sub)'}">${x.done ? '✓' : i === cur ? '▶' : '・'}</span><span class="num" style="font-weight:700;color:var(--harbor)">${x.time}</span>
    <span>${i === cur ? '<b>いまここ：</b>' : ''}${x.text}${x.btn && !x.done ? `<div class="row" style="margin-top:6px">${x.btn}</div>` : ''}</span></li>`).join('')}</ol>`;
}
function plan() {
  const g = S.game, p = g.plan;
  let h = `<h2>予定</h2><form class="card" id="plan"><p class="sub" style="margin:0 0 8px">行動開始の時刻を入れると、接触の時刻（行動開始の何分後か）が決まり、内通者・密使・蜃気楼のページにも時刻で出ます。入れないときは、実際に「行動を開始する」を押した時刻から数えます。</p>
  <label class="f" for="p-date">開催日</label><input type="date" id="p-date" name="date" value="${esc(p.date)}" style="max-width:220px">
  <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-top:4px">${g.malls.map((m, i) => `<div><label class="f" for="p-${i + 1}">ターム${i + 1} 行動開始<br><span class="sub" style="font-weight:400">${esc(m)}</span></label><input type="time" id="p-${i + 1}" name="t${i + 1}" value="${esc(p.start[i + 1] || '')}"${i + 1 < g.term || (i + 1 === g.term && g.phase !== 'brief') ? ' disabled' : ''}></div>`).join('')}</div>
  <div class="row end" style="margin-top:12px"><button class="btn" type="submit">予定を保存</button></div></form>`;
  h += `<h2>予定表</h2>${(S.schedule || []).map(T => `<div class="card"><div class="hd"><b>ターム${T.t}</b><span>${esc(T.mall)}</span>${T.start ? `<span class="num" style="font-weight:700;color:var(--harbor)">行動 ${G.hm(T.start)}〜${G.hm(T.start + g.dur.action * 60000)}</span>` : '<span class="sub">開始時刻はまだ</span>'}</div>
    <div class="tw narrow" style="margin:0"><table><tbody>${T.contacts.map(x => `<tr><td class="num" style="white-space:nowrap;font-weight:700">${x.from ? `${G.hm(x.from)}〜${G.hm(x.to)}` : `${x.fromMin}〜${x.toMin}分後`}</td><td>${G.chip(x.role)} ${x.n}回目</td><td>${esc(x.place)}</td><td><span class="pw" style="font-size:14px">${esc(x.pw)}</span></td></tr>`).join('')}</tbody></table></div></div>`).join('')}`;
  return h;
}

// ---------- 判定 ----------
// デモのコンピューターの投稿には写真がない
const photoBox = (id, alt) => id ? `<div class="photo-big" style="margin-bottom:10px"><img src="${G.img(id)}" alt="${alt}" loading="lazy"></div>`
  : `<div class="thumb" style="margin-bottom:10px;display:grid;place-items:center;color:var(--sub);font-size:14px;aspect-ratio:16/9">コンピューターの投稿（写真なし）</div>`;
const sampleImg = no => `/api/sample?k=${encodeURIComponent(G.key)}&t=${S.game.term}&no=${no}`;
// お題の判定：投稿された写真と、下見のときの見本写真を並べる
function judgePhotos(x) {
  const smp = x.kind === 'odai' && x.what?.sample;
  if (!x.photo && smp) return `<div class="photo-big" style="margin-bottom:4px"><img src="${sampleImg(x.ref)}" alt="見本写真" loading="lazy"></div><p class="sub" style="margin:0 0 10px">デモなので、見本写真をそのまま投稿に使っています。</p>`;
  if (!smp) return photoBox(x.photo, `${esc(x.name)}さんの写真`);
  return `<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:10px;align-items:start"><div><div class="sub">投稿</div>${photoBox(x.photo, `${esc(x.name)}さんの写真`)}</div><div><div class="sub">見本（下見）</div><div class="photo-big"><img src="${sampleImg(x.ref)}" alt="見本写真" loading="lazy"></div></div></div>`;
}
function what(x) {
  if (x.kind === 'odai' && x.what) return `<div class="hd"><b>お題${x.what.no}</b><span>${esc(x.what.title)}</span></div><p style="margin:0 0 4px">${esc(x.what.order)}</p>${x.what.cond ? `<p class="sub" style="margin:0"><b>条件：</b>${esc(x.what.cond)}</p>` : ''}`;
  if (x.kind === 'kinkyu' && x.what) return `<div class="hd"><b style="color:var(--ng)">緊急任務</b></div><p style="margin:0">${esc(x.what.floor)}階で、${esc(x.what.team)}チームの3人以上が写っているか</p>`;
  if (x.kind === 'harikomi' && x.what) return `<div class="hd"><b style="color:var(--r-shinshi)">張り込み</b></div><p style="margin:0">${esc(x.what.target)}さんが${esc(x.what.action)}瞬間（${esc(x.what.team)}チーム）</p>`;
  if (x.kind === 'kakuho') return `<div class="hd"><b>確保写真</b></div>`;
  return '';
}
function judge() {
  const P = (S.subs || []).filter(x => x.state === 'pending' && x.kind !== 'kakuho');
  const done = (S.subs || []).filter(x => x.state !== 'pending' && x.kind !== 'kakuho').slice(-12).reverse();
  let h = `<h1>判定待ち <span class="sub">${P.length}件（投稿の早い順）</span></h1>`;
  if (!P.length) h += `<p class="empty">${S.game.phase === 'action' ? '判定待ちの写真はありません。届くと自動で出ます。' : '行動中に届いた写真がここに出ます。'}</p>`;
  h += `<div class="grid2">${P.map(x => `<div class="card${x.kind !== 'odai' ? ' hl' : ''}" id="s${x.id}">
    ${judgePhotos(x)}
    ${what(x)}
    <div class="row" style="margin:8px 0">${teamChip(x.team)}<span>${esc(x.name)}</span><span class="sub num">${G.hm(x.at)}</span></div>
    ${x.earlier ? `<p class="notice" style="margin:0 0 8px">同じお題に、別のチームが先に出した写真があります。先にそちらを判定してください。</p>` : ''}
    <div class="row"><button class="btn ok" type="button" data-judge="${x.id}" data-ok="1"${x.earlier ? ' disabled' : ''}>${x.kind === 'odai' ? '獲得' : '認める'}</button>
    <button class="btn ng" type="button" data-judge="${x.id}" data-ok="0">却下</button></div>
    <div class="row" style="margin-top:8px">${NG.map(n => `<button class="btn ghost small" type="button" data-judge="${x.id}" data-ok="0" data-note="${esc(n)}">却下：${esc(n)}</button>`).join('')}</div></div>`).join('')}</div>`;
  if (done.length) h += `<h2>最近の判定</h2><div class="tw"><table><tbody>${done.map(x => `<tr><td class="num sub">${G.hm(x.judged_at || x.at)}</td><td>${x.kind === 'odai' ? `お題${x.ref}` : x.kind === 'kinkyu' ? '緊急任務' : '張り込み'}</td><td>${esc(x.team)}　${esc(x.name)}</td><td><span class="st ${x.state}">${{ ok: '認めた', ng: '却下', late: '先に獲得あり' }[x.state]}</span> <span class="sub">${esc(x.note || '')}</span></td></tr>`).join('')}</tbody></table></div>`;
  return h;
}

// ---------- 接触 ----------
function contact() {
  if (!S.contacts) return '<p class="empty">ターム1が始まると出ます。</p>';
  const t = G.now(), slots = [];
  for (const c of S.contacts) for (const x of c.slots) slots.push({ ...x, role: c.role, pw: c.pw });
  slots.sort((a, b) => a.fromMin - b.fromMin);
  return `<h1>接触</h1><p class="sub">決めた時間と場所で待ち、合言葉を言えた人の名前を押します。伝える内容は、その人の個人ページに自動で届きます。</p>
  ${slots.map(x => { const nowIn = x.from && t >= x.from - 60000 && t <= x.to + 60000; return `<div class="card${nowIn ? ' hl' : ''}"><div class="hd">${chip(x.role)}<b>${x.n}回目</b><span class="num" style="font-weight:700;color:var(--harbor)">${x.from ? `${G.hm(x.from)}〜${G.hm(x.to)}` : `開始${x.fromMin}〜${x.toMin}分後`}</span>${nowIn ? '<span class="st ok">いま</span>' : ''}</div>
    <p style="margin:0 0 8px">${esc(x.place)}　合言葉 <span class="pw">${esc(x.pw)}</span></p>
    <div class="row">${x.who.map(w => w.done ? `<span class="btn ghost small" aria-disabled="true">✓ ${esc(w.name)}（${w.team}）</span>` : `<button class="btn small" type="button" data-contact="${esc(x.role)}" data-slot="${x.n}" data-player="${w.id}" data-name="${esc(w.name)}"${S.game.phase === 'action' ? '' : ' disabled'}>${esc(w.name)}（${w.team}）に会えた</button>`).join('')}</div>
    <p class="sub" style="margin:6px 0 0">${x.role === '密使' ? '届く内容：自分のチームの公安を1人' : x.role === '蜃気楼' ? (x.n === 1 ? '届く内容：自分のチームの内通者の名前' : '届く内容：妨害の権利1回') : '届く内容：妨害の権利1回'}</p></div>`; }).join('')}`;
}

// ---------- お題 ----------
function odai() {
  if (!S.odai) return '<p class="empty">ターム1が始まると出ます。</p>';
  const lab = { wait: '未公開', open: '公開中', taken: '獲得' };
  return `<h1>お題 <span class="sub">${esc(S.term.mall)}</span></h1><div class="tw"><table><thead><tr><th class="num">No</th><th>お題</th><th>状態</th></tr></thead><tbody>${S.odai.map(o => `<tr${o.state === 'open' ? ' class="first"' : ''}><td class="num">${o.no}</td><td><b>${esc(o.title)}</b><div class="sub">${esc(o.order)}</div></td><td>${lab[o.state]}${o.state === 'taken' ? `<div>${esc(o.team)}チーム（${o.ord}番目）</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- 妨害・張り込み ----------
function sab() {
  if (!S.sabotage) return '<p class="empty">ターム1が始まると出ます。</p>';
  const act = S.sabotage.filter(z => z.state === 'active');
  let h = `<h1>妨害・張り込み</h1>`;
  h += act.length ? act.map(z => `<div class="card alert"><h3>緊急任務：${esc(z.team)}チーム</h3><p>${esc(z.floor)}階で3人以上（${esc(z.by)}さんが ${G.hm(z.at)} に発動）。写真は「判定」に届きます。</p><button class="btn ng small" type="button" data-clear="${z.id}">写真なしで解除する</button></div>`).join('') : '<p class="sub">いま出ている緊急任務はありません。</p>';
  h += `<h2>妨害の権利</h2><div class="tw"><table><thead><tr><th>名前</th><th>チーム</th><th>役職</th><th class="num">残り</th><th class="num">使った</th></tr></thead><tbody>${S.rights.map(r => `<tr><td>${esc(r.name)}</td><td>${r.team}</td><td>${chip(r.role)}</td><td class="num">${r.left}</td><td class="num">${r.used}</td></tr>`).join('')}</tbody></table></div>`;
  h += `<h2>張り込み</h2><div class="tw"><table><thead><tr><th>チーム</th><th>瞬間</th><th>状態</th></tr></thead><tbody>${S.harikomi.map(x => `<tr><td>${x.team}</td><td>${esc(x.target)}さんが${esc(x.action)}瞬間</td><td>${x.done ? '<span class="st ok">達成</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`;
  if (S.sabotage.length) h += `<h2>このタームの妨害</h2><div class="tw"><table><tbody>${S.sabotage.map(z => `<tr><td class="num">${G.hm(z.at)}</td><td>${z.team}チーム</td><td>${esc(z.floor)}階</td><td>${esc(z.by)}</td><td>${z.state === 'active' ? '<span class="st ng">発動中</span>' : '<span class="st ok">解除</span>'}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}

// ---------- 確保の採点 ----------
const draft = {};
function kakuho() {
  if (!S.term) return '<p class="empty">ターム1が始まると出ます。</p>';
  const T = S.term;
  let h = `<h1>確保の採点</h1><details class="card"><summary><b>答えの写真と場所</b></summary><div class="photo-big" style="margin:10px 0"><img src="${G.answerImg(S.game.term)}" alt="答えの写真" loading="lazy"></div><p style="margin:0">${esc(T.answer)}</p></details>`;
  h += S.kakuho.map(k => {
    if (!k.sub) return `<div class="card"><div class="hd">${teamChip(k.team)}</div><p class="sub" style="margin:0">確保写真はまだ出ていません。出なかったチームは0点です。</p></div>`;
    const sel = draft[k.team] || new Set(k.checks || []);
    return `<div class="card${k.score == null ? ' hl' : ''}"><div class="hd">${teamChip(k.team)}${k.score == null ? '<span class="st pending">未採点</span>' : `<span class="st ok">${k.score}点</span>`}</div>
    ${k.photo || !S.game.demo ? photoBox(k.photo, `${k.team}チームの確保写真`) : '<p class="notice">デモなので、確保写真はありません。採点の練習として、項目にチェックを入れてみてください。</p>'}
    <form data-kakuho="${k.team}"><ul class="checks">${T.checks.map(c => `<li><label><span class="n">${c.no}</span><input type="checkbox" name="c" value="${c.no}"${sel.has(c.no) ? ' checked' : ''}><span>${esc(c.item)}${c.bep ? ' <span class="mk">密使の項目</span>' : ''}</span></label></li>`).join('')}</ul>
    <div class="row end" style="margin-top:10px"><span class="sub" data-count>${sel.size}点</span><button class="btn" type="submit">この点数で保存</button></div></form></div>`;
  }).join('');
  return h;
}

// ---------- 参加者 ----------
function people() {
  const g = S.game, owner = !S.by;
  const terms = Array.from({ length: g.terms }, (_, i) => i + 1);
  const editable = t => owner && t > g.term;
  let h = `<h1>参加者 <span class="sub">${S.players.length}人</span></h1>`;
  if (!owner) return h + `<p class="sub">あなたはこのタームのGMを任された参加者です。URLの送り直しと役職の割り振りは、主催者のGM手帳からだけできます。</p>` + rolesTable(terms, editable, false);
  h += `<p>それぞれの個人ページのURLです。本人にだけ送ってください（LINEの個別トークなど）。<b>GM</b>に決めた人は、そのタームはプレイせず、自分のURLのまま GM手帳 を開けます（何人でも）。GMや休みにしたら「割り振り直す」で残りの人のチームと役職を作り直してください。</p>
  <div class="row" style="margin-bottom:10px"><button class="btn ghost small" type="button" data-copyall>全員分を名前つきでコピー</button>${g.phase === 'setup' || g.phase === 'result' ? '<button class="btn ghost small" type="button" data-shuffle>これからのタームを割り振り直す（GM・休みはそのまま）</button>' : ''}</div>`;
  h += rolesTable(terms, editable, true);
  const bad = roleCheck();
  if (bad.length) h += `<div class="notice">${bad.map(esc).join('<br>')}</div>`;
  return h;
}
function rolesTable(terms, editable, urls) {
  const g = S.game;
  const opts = r => ['', 'GM', 'A', 'B', 'C'].flatMap(tm => tm === 'GM' ? [`<option value="|GM"${r?.role === 'GM' ? ' selected' : ''}>GM</option>`] : tm ? ['公安', '内通者', '密使', '蜃気楼'].map(rl => `<option value="${tm}|${rl}"${r?.team === tm && r?.role === rl ? ' selected' : ''}>${tm} ${rl}</option>`) : [`<option value=""${!r?.role ? ' selected' : ''}>休み</option>`]).join('');
  const cell = r => r?.role === 'GM' ? '<span class="chip" style="background:var(--sign);color:var(--on-sign)">GM</span>' : `<span class="row" style="gap:4px">${r?.team ? `<span class="sub">${r.team}</span>` : ''}${chip(r?.role)}</span>`;
  return `<div class="tw"><table><thead><tr><th>名前</th>${terms.map(t => `<th>ターム${t}</th>`).join('')}${urls ? '<th>URL</th>' : ''}</tr></thead><tbody>${S.players.map(p => `<tr><td><b>${esc(p.name)}</b>${p.bot ? ' <span class="sub">（自動）</span>' : ''}${g.term && S.roles[g.term]?.[p.id]?.role && S.roles[g.term][p.id].role !== 'GM' ? (S.voted?.includes(p.id) ? ' <span class="st ok">投票済</span>' : '') : ''}</td>
    ${terms.map(t => { const r = S.roles[t]?.[p.id]; return `<td>${editable(t) ? `<select data-role="${t}" data-player="${p.id}" aria-label="${esc(p.name)} ターム${t}" style="min-width:132px;padding:4px 6px;font-size:14px">${opts(r)}</select>` : t <= g.term || !S.by ? cell(r) : '－'}</td>`; }).join('')}
    ${urls ? `<td><button class="btn ghost small" type="button" data-copy="${location.origin}/p/${p.tok}">コピー</button> <a class="sub" href="/p/${p.tok}" target="_blank" rel="noopener">開く</a></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function roleCheck() {
  const out = [];
  for (const [t, m] of Object.entries(S.roles)) {
    if (Number(t) <= S.game.term) continue;
    for (const tm of ['A', 'B', 'C']) for (const r of ['内通者', '密使', '蜃気楼']) { const n = Object.values(m).filter(x => x.team === tm && x.role === r).length; if (n !== 1) out.push(`ターム${t}：${tm}チームの${r}が${n}人です（1人ずつにしてください）`); }
  }
  return out;
}

// ---------- 結果 ----------
function res() {
  const R = S.res?.terms || [];
  if (!R.length) return `<h1>結果</h1><p class="empty">タームの結果を発表すると、ここに出ます。</p>`;
  let rank = 0, prev = null;
  const sc = S.res.scaled;
  let h = `<h1>結果</h1><div class="tw"><table><thead><tr><th class="num">順位</th><th>名前</th>${R.map(r => `<th class="num">T${r.t}</th>`).join('')}<th class="num">合計</th>${sc ? '<th class="num">補正後</th>' : ''}</tr></thead><tbody>${S.res.totals.map((x, i) => { if (x.adj !== prev) { rank = i + 1; prev = x.adj; } return `<tr${rank === 1 ? ' class="first"' : ''}><td class="num">${rank}</td><td><b>${esc(x.name)}</b></td>${R.map(r => `<td class="num">${x.by[r.t] ?? '－'}</td>`).join('')}<td class="num${sc ? '' : ' total'}">${x.sum}</td>${sc ? `<td class="num total">${x.adj}${x.rate !== 1 ? `<span class="sub">（×${Math.round(x.rate * 100) / 100}）</span>` : ''}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>${sc ? '<p class="sub">参加したタームが少ない人（GM・休み）は、合計を「終わったターム数 ÷ 参加したターム数」倍しています。順位は補正後です。</p>' : ''}`;
  for (const r of R.slice().reverse()) h += `<h2>ターム${r.t}</h2><div class="tw narrow"><table><thead><tr><th>チーム</th><th class="num">確保点</th><th class="num">密使の3項目</th><th class="num">妨害</th></tr></thead><tbody>${r.teams.map(x => `<tr${x.top ? ' class="first"' : ''}><td>${x.team}${x.top ? '　トップ賞' : ''}</td><td class="num total">${x.kakuho}</td><td class="num">${x.bep3}／3</td><td class="num">${x.bougai}</td></tr>`).join('')}</tbody></table></div>
    <div class="tw"><table><thead><tr><th>名前</th><th>チーム</th><th>役職</th><th>投票（内通者／密使／蜃気楼）</th><th class="num">点</th></tr></thead><tbody>${r.players.map(p => `<tr><td><b>${esc(p.name)}</b></td><td>${p.team}</td><td>${chip(p.role)}</td><td class="sub">${p.voted ? `${esc(p.vote.s) || '－'}／${esc(p.vote.b) || '－'}／${esc(p.vote.t) || '－'}` : '未投票'}</td><td class="num total">${p.pt}</td></tr>`).join('')}</tbody></table></div>`;
  return h;
}

// ---------- 操作 ----------
async function run(f, okMsg) { try { await f(); if (okMsg) G.toast(okMsg); G.nudge(); } catch (e) { G.toast(e.message, true); } }
async function copy(text) { try { await navigator.clipboard.writeText(text); G.toast('コピーしました'); } catch { prompt('コピーしてください', text); } }
document.addEventListener('click', e => {
  const el = e.target.closest('button,[data-tab]'); if (!el) return;
  const d = el.dataset;
  if (d.tab) { tab = d.tab; G.store.set('gtab:' + G.key, tab); render(); window.scrollTo(0, 0); return; }
  if (d.phase) { if (confirm(`${d.label}\nよろしいですか？`)) run(() => G.act('phase', { to: d.phase }), '進めました'); return; }
  if (d.judge) {
    let note = d.note || '';
    if (d.ok === '0' && !d.note) { const n = prompt('却下の理由（空欄でもOK）', ''); if (n === null) return; note = n; }
    el.disabled = true;
    run(() => G.act('judge', { sub: Number(d.judge), ok: d.ok === '1', note }), d.ok === '1' ? '認めました' : '却下しました'); return;
  }
  if (d.contact) { if (confirm(`${d.name}さんの接触（${d.contact}・${d.slot}回目）を成功にしますか？`)) run(() => G.act('contact', { role: d.contact, slot: Number(d.slot), player: d.player }), '届けました'); return; }
  if (d.shift) { run(() => G.act('demoShift', { to: d.shift }), '時間を進めました'); return; }
  if (d.clear) { if (confirm('写真なしで緊急任務を解除しますか？')) run(() => G.act('clear', { id: Number(d.clear) }), '解除しました'); return; }
  if (d.shuffle !== undefined) { if (confirm('3ターム分のチームと役職を、すべて割り振り直しますか？')) run(() => G.act('shuffle'), '割り振り直しました'); return; }
  if (d.copy) { copy(d.copy); return; }
  if (d.copyall !== undefined) { copy(S.players.map(p => `${p.name}さん：${location.origin}/p/${p.tok}`).join('\n')); }
});
document.addEventListener('change', e => {
  const s = e.target;
  if (s.matches('[data-role]')) { const [team, role] = s.value.split('|'); run(() => G.act('role', { term: Number(s.dataset.role), player: s.dataset.player, team: team || null, role: role || null }), '変えました'); }
  const f = s.closest('form[data-kakuho]');
  if (f) { const set = new Set([...f.querySelectorAll('input:checked')].map(i => Number(i.value))); draft[f.dataset.kakuho] = set; f.querySelector('[data-count]').textContent = `${set.size}点`; }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'plan') {
    e.preventDefault();
    const fd = new FormData(e.target), start = {};
    // 入れられない（始まった）タームは今の値のまま送る
    for (let t = 1; t <= S.game.terms; t++) { const v = fd.get('t' + t) ?? S.game.plan.start[t]; if (v) start[t] = v; }
    run(() => G.act('plan', { date: fd.get('date'), start }), '予定を保存しました');
    return;
  }
  const f = e.target.closest('form[data-kakuho]'); if (!f) return;
  e.preventDefault();
  const team = f.dataset.kakuho, checks = [...f.querySelectorAll('input:checked')].map(i => Number(i.value));
  run(async () => { await G.act('kakuho', { team, checks }); delete draft[team]; }, `${team}チーム ${checks.length}点で保存しました`);
});

G.poll(d => {
  S = d;
  // 採点の途中や選択中は画面を描き直さない
  if (document.activeElement?.closest?.('form[data-kakuho], form#plan, select')) return;
  render();
}, 3000);
// 接触の「いまの時間です」など、時刻で変わる表示のために時々描き直す
setInterval(() => { if (!document.activeElement?.closest?.('form, select')) render(); }, 20000);
})();
