// GM手帳（/gm/<鍵>）
(() => {
const { esc, $, chip, team: teamChip } = G;
let S = null, tab = G.store.get('gtab:' + G.key, 'judge');
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
  const L = [['judge', '判定', pend], ['contact', '接触'], ['odai', 'お題'], ['sab', '妨害・張り込み'], ['kakuho', '確保の採点'], ['people', '参加者'], ['res', '結果']];
  return L.map(([id, l, n]) => `<button type="button" data-tab="${id}"${id === tab ? ' aria-current="page"' : ''}>${l}${n ? `<span class="badge">${n}</span>` : ''}</button>`).join('');
}
function render() {
  if (!S) return;
  if (S.error) { G.patch($('#main'), `<div class="empty"><h1>ページが見つかりません</h1></div>`); return; }
  const g = S.game;
  G.patch($('#bar'), `<span class="pict" aria-hidden="true">?</span><span class="bar-t"><b>GM手帳</b><small>${esc(g.title)}${g.term ? `　ターム${g.term}／${g.terms} ${esc(g.mall)}` : ''}</small></span>${G.clockHTML(g)}`);
  G.patch($('#demo'), g.demo ? `<div class="demo-bar">デモのGM手帳です。参加者の写真はコンピューターが出しています。</div>` : '');
  G.patch($('#tabs'), tabs());
  const f = { judge, contact, odai, sab, kakuho, people, res }[tab] || judge;
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
  return `<div class="card" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><div><div class="sub">いま：${G.PHASE[S.game.phase]}${S.game.term ? `（ターム${S.game.term}）` : ''}</div>${warn.map(w => `<div style="color:var(--ng);font-size:14px;font-weight:700">${esc(w)}</div>`).join('')}${n?.[2] ? `<div class="sub">${esc(n[2])}</div>` : ''}</div>
  ${n ? `<button class="btn sign" type="button" data-phase="${n[0]}" data-label="${esc(n[1])}">${esc(n[1])} →</button>` : '<span class="sub">ゲームは終わりました</span>'}</div>`;
}

// ---------- 判定 ----------
// デモのコンピューターの投稿には写真がない
const photoBox = (id, alt) => id ? `<div class="photo-big" style="margin-bottom:10px"><img src="${G.img(id)}" alt="${alt}" loading="lazy"></div>`
  : `<div class="thumb" style="margin-bottom:10px;display:grid;place-items:center;color:var(--sub);font-size:14px;aspect-ratio:16/9">コンピューターの投稿（写真なし）</div>`;
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
    ${photoBox(x.photo, `${esc(x.name)}さんの写真`)}
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
    ${photoBox(k.photo, `${k.team}チームの確保写真`)}
    <form data-kakuho="${k.team}"><ul class="checks">${T.checks.map(c => `<li><label><span class="n">${c.no}</span><input type="checkbox" name="c" value="${c.no}"${sel.has(c.no) ? ' checked' : ''}><span>${esc(c.item)}${c.bep ? ' <span class="mk">密使の項目</span>' : ''}</span></label></li>`).join('')}</ul>
    <div class="row end" style="margin-top:10px"><span class="sub" data-count>${sel.size}点</span><button class="btn" type="submit">この点数で保存</button></div></form></div>`;
  }).join('');
  return h;
}

// ---------- 参加者 ----------
function people() {
  const origin = location.origin, g = S.game;
  const terms = [1, 2, 3].slice(0, g.terms);
  const editable = t => t > g.term;
  let h = `<h1>参加者 <span class="sub">${S.players.length}人</span></h1>`;
  h += `<p>それぞれの個人ページのURLです。本人にだけ送ってください（LINEの個別トークなど）。</p><div class="row" style="margin-bottom:10px"><button class="btn ghost small" type="button" data-copyall>全員分を名前つきでコピー</button>${g.phase === 'setup' ? '<button class="btn ghost small" type="button" data-shuffle>チームと役職を割り振り直す</button>' : ''}</div>`;
  h += `<div class="tw"><table><thead><tr><th>名前</th>${terms.map(t => `<th>ターム${t}</th>`).join('')}<th>URL</th></tr></thead><tbody>${S.players.map(p => `<tr><td><b>${esc(p.name)}</b>${p.bot ? ' <span class="sub">（自動）</span>' : ''}${g.term && S.roles[g.term]?.[p.id]?.role ? (S.voted?.includes(p.id) ? ' <span class="st ok">投票済</span>' : '') : ''}</td>
    ${terms.map(t => { const r = S.roles[t]?.[p.id]; return `<td>${editable(t) ? `<select data-role="${t}" data-player="${p.id}" aria-label="${esc(p.name)} ターム${t}" style="min-width:132px;padding:4px 6px;font-size:14px">${['', 'A', 'B', 'C'].flatMap(tm => tm ? ['公安', '内通者', '密使', '蜃気楼'].map(rl => `<option value="${tm}|${rl}"${r?.team === tm && r?.role === rl ? ' selected' : ''}>${tm} ${rl}</option>`) : [`<option value=""${!r?.role ? ' selected' : ''}>休み</option>`]).join('')}</select>` : `<span class="row" style="gap:4px">${r?.team ? `<span class="sub">${r.team}</span>` : ''}${chip(r?.role)}</span>`}</td>`; }).join('')}
    <td><button class="btn ghost small" type="button" data-copy="${origin}/p/${p.tok}">コピー</button> <a class="sub" href="/p/${p.tok}" target="_blank" rel="noopener">開く</a></td></tr>`).join('')}</tbody></table></div>`;
  const bad = roleCheck();
  if (bad.length) h += `<div class="notice">${bad.map(esc).join('<br>')}</div>`;
  return h;
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
  let h = `<h1>結果</h1><div class="tw"><table><thead><tr><th class="num">順位</th><th>名前</th>${R.map(r => `<th class="num">T${r.t}</th>`).join('')}<th class="num">合計</th></tr></thead><tbody>${S.res.totals.map((x, i) => { if (x.sum !== prev) { rank = i + 1; prev = x.sum; } return `<tr${rank === 1 ? ' class="first"' : ''}><td class="num">${rank}</td><td><b>${esc(x.name)}</b></td>${R.map(r => `<td class="num">${x.by[r.t] ?? '－'}</td>`).join('')}<td class="num total">${x.sum}</td></tr>`; }).join('')}</tbody></table></div>`;
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
  const f = e.target.closest('form[data-kakuho]'); if (!f) return;
  e.preventDefault();
  const team = f.dataset.kakuho, checks = [...f.querySelectorAll('input:checked')].map(i => Number(i.value));
  run(async () => { await G.act('kakuho', { team, checks }); delete draft[team]; }, `${team}チーム ${checks.length}点で保存しました`);
});

G.poll(d => {
  S = d;
  // 採点の途中や選択中は画面を描き直さない
  if (document.activeElement?.closest?.('form[data-kakuho], select')) return;
  render();
}, 3000);
// 接触の「いまの時間です」など、時刻で変わる表示のために時々描き直す
setInterval(() => { if (!document.activeElement?.closest?.('form, select')) render(); }, 20000);
})();
