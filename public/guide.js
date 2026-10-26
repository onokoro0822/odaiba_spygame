// デモの案内（tour）と、やってみる（try）の課題リスト。個人ページとGM手帳の両方で使う
(() => {
const { esc } = G;
const isGmPage = G.asGm;
const wait = ms => new Promise(r => setTimeout(r, ms));
const q = sel => { try { return document.querySelector(sel); } catch { return null; } };
const store = (k, v) => v === undefined ? G.store.get(`guide:${G.key}:${k}`, null) : G.store.set(`guide:${G.key}:${k}`, v);

// 場面を進める（参加者のデモは demoSkip、GMのデモは phase）
async function advanceTo(to) {
  for (let i = 0; i < 6 && G.S?.game.phase !== to; i++) {
    const ph = G.S.game.phase;
    const next = { setup: 'brief', brief: 'action', action: 'meeting', meeting: 'vote', vote: 'result' }[ph];
    if (!next) break;
    try { await (isGmPage ? G.act('phase', { to: next }) : G.act('demoSkip')); } catch (e) { G.toast(e.message, true); break; }
    G.refresh(); await until(() => G.S?.game.phase === next, 4000);
  }
}
async function until(f, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await wait(150); } return false; }
const tab = id => { const b = q(`[data-tab="${id}"]`); if (b && b.getAttribute('aria-current') !== 'page') b.click(); };

// ---------- 画面の案内 ----------
const TOUR = {
  'tour-player': [
    { phase: 'setup', tab: 'now', sel: '#main .card', text: 'これがあなた専用の個人ページです。GMから届いたURLを開くだけで使えます。ログインはありません。URLは人に見せないでください。' },
    { phase: 'setup', sel: '#bar', text: '上の帯には、自分の名前とチーム、いまのターム、残り時間が出ます。' },
    { phase: 'brief', tab: 'now', sel: '.reveal', text: 'ターム開始時に役職が届きます。まわりに見えないように、タップしたときだけ表示します（開く前は色でも分かりません）。' },
    { phase: 'brief', tab: 'now', click: '.reveal .lid', sel: '.reveal', text: 'このデモでは、あなたは「内通者」です。答えの写真を知っている敵の役です。' },
    { phase: 'action', tab: 'now', sel: '.od', text: '行動が始まると、お題が3つ公開されます。3チーム共通の早い者勝ちです。' },
    { phase: 'action', tab: 'now', sel: '[data-up="odai"]', text: 'ここを押すとカメラが開きます。撮った写真がGMに届き、認められると「獲得」です。' },
    { phase: 'action', tab: 'now', sel: '.st.pending', text: '出した写真は、GMが見ているあいだ「判定待ち」になります。' },
    { phase: 'action', tab: 'now', sel: '.card.alert', text: 'だれかが妨害を発動すると、緊急任務が出ます。写真が認められるまで、全チームがお題を獲得できません。' },
    { phase: 'action', tab: 'now', sel: '[data-up="kakuho"]', text: '手掛かりから答えの場所を推理して、答えに近い1枚を「確保写真」として出します。チームで1回だけです。' },
    { phase: 'action', tab: 'clue', sel: '.feed li.reward', text: 'お題を獲得すると、出した人にだけ手掛かりか割符が届きます。口で伝えるのはOK、画面を見せるのは禁止です。' },
    { phase: 'action', tab: 'clue', sel: '.feed li.alert, .feed li.contact', text: 'GMとの接触の結果や、緊急任務などのお知らせもここに届きます。' },
    { phase: 'action', tab: 'role', click: '.reveal .lid', sel: '[data-tour="points"]', text: '役職の画面では、任務と点数の付き方を確かめられます。' },
    { phase: 'action', tab: 'role', sel: '[data-tour="answer"]', text: '内通者には答えの写真が届きます。チームには見せずに、嘘や誘導で遠ざけます。（密使には、ここに本物の情報が3つ出ます）' },
    { phase: 'action', tab: 'role', sel: '[data-tour="contact"]', text: '内通者・密使・蜃気楼には、GMと会う時間・場所・合言葉が出ます。会えるとGMが名前を押し、結果が自動で届きます。' },
    { phase: 'action', tab: 'role', sel: '[data-tour="sabotage"]', text: '接触や張り込みで妨害の権利が増えます。ここから発動します。' },
    { phase: 'action', tab: 'role', sel: '[data-tour="harikomi"]', text: '内通者は「張り込み」で仲間の決まった瞬間を撮ると、妨害の権利が増えます。' },
    { phase: 'meeting', tab: 'now', sel: '#vote', text: '行動が終わると作戦会議です。チームの中で、内通者・密使・蜃気楼だと思う人を1人ずつ投票します。' },
    { phase: 'result', tab: 'now', sel: '#main .card.hl', text: '結果発表では、自分の点数、答えの写真、全員の正体と投票が出ます。' },
    { phase: 'result', tab: 'res', sel: '#main .tw', text: '「結果」には3タームの合計が出ます。GMや休みで参加が少ない人は、合計を補正して比べます。' },
    { end: true, text: '案内は以上です。トップページの「やってみる」で、実際に写真を出したり投票したりできます。' },
  ],
  'tour-gm': [
    { phase: 'setup', tab: 'flow', sel: '[data-tour="script"]', text: 'GM手帳を開くと、まず「台本」が出ます。このタームでGMがやることを時刻の順に並べ、いまやる行に「いまここ」とボタンが出ます。' },
    { phase: 'setup', tab: 'flow', sel: '#plan', text: '開催日と、タームごとの行動開始の時刻を入れます。接触の時刻はここから自動で決まり、役職の人のページにも出ます。' },
    { phase: 'setup', tab: 'people', sel: '#main .tw', text: '参加者の表です。URLのコピー、チームと役職の直し、タームごとのGM・休みの指定ができます。GMは何人でもよく、GMの人は自分のURLのままGM手帳を開けます。' },
    { phase: 'setup', tab: 'flow', sel: '[data-phase]', text: '準備ができたら、このボタンで場面を進めます。どのタブにいても出ています。' },
    { phase: 'action', tab: 'flow', sel: '[data-tour="memo"]', text: '行動中は、いちばん上に「接触メモ」が出ます。いまの接触の場所・合言葉・来るはずの人が並び、会えたらその場で名前を押します。' },
    { phase: 'action', tab: 'judge', sel: '.grid2 > .card', text: '「判定」には届いた写真が、投稿の早い順に並びます。右には下見のときの見本写真が出るので、見比べて判定します。' },
    { phase: 'action', tab: 'judge', sel: '[data-judge][data-ok="1"]', text: '「獲得」を押すと、出した人に手掛かりか割符が自動で届き、次のお題が公開されます。' },
    { phase: 'action', tab: 'judge', sel: '[data-note]', text: '却下するときは、理由を1タップで添えられます。' },
    { phase: 'action', tab: 'judge', sel: '.notice', text: '同じお題に別のチームが先に出していると、こう出ます。早い者勝ちは投稿の時刻順なので、先の写真から判定します。' },
    { phase: 'action', tab: 'sab', sel: '.card.alert', text: '妨害で緊急任務が出ると、ここと判定に出ます。写真が届いたら「認める」で解除されます。' },
    { phase: 'action', tab: 'contact', sel: '#main .card:not([data-tour])', text: '「接触」には、このタームの接触が全部並びます。誰が済んだかも分かります。' },
    { phase: 'meeting', tab: 'kakuho', sel: 'form[data-kakuho]', text: '行動が終わったら、各チームの確保写真を20項目でチェックして採点します。点数と密使の項目は自動で数えます。' },
    { phase: 'result', tab: 'res', sel: '#main .tw', text: '結果を発表すると、全員の画面に正体と点数が出ます。合計は3ターム分を自動で計算します。' },
    { end: true, text: '案内は以上です。トップページの「GM・やってみる」で、実際に判定や接触を練習できます。' },
  ],
};

let ov = null;
function ensureOverlay() {
  if (ov) return ov;
  ov = document.createElement('div');
  ov.innerHTML = `<div id="g-hole" style="position:fixed;z-index:40;border-radius:8px;box-shadow:0 0 0 9999px rgba(10,16,22,.62);outline:3px solid var(--sign);pointer-events:none;transition:all .2s"></div>
  <div id="g-tip" role="dialog" aria-live="polite" style="position:fixed;z-index:41;left:16px;right:16px;max-width:460px;margin:0 auto;background:var(--panel);color:var(--ink);border:2px solid var(--sign);border-radius:10px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.35)"></div>`;
  document.body.appendChild(ov);
  return ov;
}
async function showStep(steps, i) {
  ensureOverlay();
  const s = steps[i], tip = document.getElementById('g-tip'), hole = document.getElementById('g-hole');
  store('step', i);
  if (s.end) {
    hole.style.cssText += ';width:0;height:0;left:50%;top:50%';
    tip.style.top = '30%'; tip.style.bottom = 'auto';
    tip.innerHTML = `<p style="margin:0 0 10px">${esc(s.text)}</p><div class="row end"><button class="btn ghost small" type="button" data-g="prev">戻る</button><a class="btn small" href="/">トップへ</a><button class="btn sign small" type="button" data-g="close">閉じる</button></div>`;
    return;
  }
  tip.innerHTML = `<p class="sub" style="margin:0 0 6px">準備しています…</p>`;
  if (s.phase && G.S?.game.phase !== s.phase) await advanceTo(s.phase);
  if (s.tab) { tab(s.tab); await wait(250); }
  if (s.click) { const c = q(s.click); if (c && c.offsetParent) { c.click(); await wait(250); } }
  let el = q(s.sel);
  if (!el) { await wait(1200); el = q(s.sel); }
  if (!el) return showStep(steps, i + 1);    // その場面に無いもの（例：先に投稿がない）は飛ばす
  // 上の帯（固定）の下に入らないように、背の高いものは上をそろえる
  const r0 = el.getBoundingClientRect();
  window.scrollTo({ top: r0.height > window.innerHeight * 0.45 ? window.scrollY + r0.top - 140 : window.scrollY + r0.top - window.innerHeight / 2 + r0.height / 2, behavior: 'instant' });
  await wait(80);
  const r = el.getBoundingClientRect(), pad = 6;
  Object.assign(hole.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${Math.min(r.height, window.innerHeight * 0.6) + pad * 2}px` });
  const below = r.top < window.innerHeight / 2;
  tip.style.top = below ? `${Math.min(window.innerHeight - 200, r.top + Math.min(r.height, window.innerHeight * 0.6) + 18)}px` : 'auto';
  tip.style.bottom = below ? 'auto' : `${Math.min(window.innerHeight - 200, window.innerHeight - r.top + 18)}px`;
  tip.innerHTML = `<div class="sub" style="margin-bottom:4px">${i + 1} / ${steps.length - 1}</div><p style="margin:0 0 10px">${esc(s.text)}</p>
  <div class="row end">${i ? '<button class="btn ghost small" type="button" data-g="prev">戻る</button>' : ''}<button class="btn ghost small" type="button" data-g="close">案内を閉じる</button><button class="btn sign small" type="button" data-g="next">次へ</button></div>`;
}
function startTour(mode) {
  const steps = TOUR[mode]; let i = store('step') ?? 0;
  const go = n => { i = Math.max(0, Math.min(steps.length - 1, n)); showStep(steps, i); };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    if (b.dataset.g === 'next') go(i + 1);
    if (b.dataset.g === 'prev') go(i - 1);
    if (b.dataset.g === 'close') { ov?.remove(); ov = null; reopen(() => { ov = null; go(i); }); }
  });
  window.addEventListener('resize', () => ov && showStep(steps, i));
  go(i);
}
function reopen(f) {
  const b = document.createElement('button'); b.className = 'btn sign small'; b.textContent = '案内を開く'; b.type = 'button';
  b.style.cssText = 'position:fixed;right:16px;bottom:84px;z-index:30';
  b.onclick = () => { b.remove(); f(); }; document.body.appendChild(b);
}

// ---------- やってみる（課題リスト） ----------
const mine = (S, kind, st) => (S.subs || []).some(x => x.kind === kind && x.mine && (!st || x.state === st));
const TASKS = {
  'try-player': [
    { t: '「次の場面へ進める」で、ターム1を始める（役職が届く）', ok: S => S.game.phase !== 'setup' },
    { t: '「役職」を開いて、自分の役職と任務を確かめる', ok: () => !!store('roleSeen'), hint: '下の「役職」→ カードをタップ' },
    { t: '「次の場面へ進める」で、行動を始める', ok: S => ['action', 'meeting', 'vote', 'result', 'end'].includes(S.game.phase) },
    { t: 'お題の写真を1枚撮って出す（何を撮ってもOK）', ok: S => mine(S, 'odai') || S.game.phase !== 'action' && !!store('sent'), hint: '「いま」のお題の「写真を撮って出す」' },
    { t: 'GMの判定を待って、届いた手掛かりを読む', ok: S => (S.inbox || []).some(m => m.kind === 'reward') && !!store('clueSeen'), hint: '数秒で判定されます。下の「届いたもの」' },
    { t: 'GMとの接触をする（デモではボタンで合言葉を言えたことに）', ok: S => S.contact?.slots.some(x => x.done), hint: '「役職」→ GMとの接触 の「（デモ）GMに合言葉を言えたことにする」' },
    { t: '妨害を発動する', ok: S => (S.sabCount || 0) > 0, hint: '「役職」→ 妨害 の「妨害を発動する」' },
    { t: '自分のチームの緊急任務の写真を出す', ok: S => mine(S, 'kinkyu') || (S.sabCount > 0 && !S.sabotage?.some(z => z.team === S.team)), hint: '「いま」の赤い枠の「緊急任務の写真を撮って出す」' },
    { t: '確保写真を出す', ok: S => !!S.kakuho || ['meeting', 'vote', 'result', 'end'].includes(S.game.phase), hint: '「いま」のいちばん下' },
    { t: '「次の場面へ進める」で作戦会議へ', ok: S => ['meeting', 'vote', 'result', 'end'].includes(S.game.phase) },
    { t: '内通者・密使・蜃気楼だと思う人に投票する', ok: S => !!S.vote || ['result', 'end'].includes(S.game.phase), hint: '「いま」の投票の欄' },
    { t: '「次の場面へ進める」を2回押して、結果を見る', ok: S => ['result', 'end'].includes(S.game.phase) },
  ],
  'try-gm': [
    { t: '「ターム1の役職を発表する」を押す', ok: S => S.game.phase !== 'setup', hint: '上のボタン（どのタブにも出ています）' },
    { t: '「行動を開始する」を押す', ok: S => ['action', 'meeting', 'vote', 'result', 'end'].includes(S.game.phase) },
    { t: '届いた写真を1枚「獲得」にする', ok: S => (S.subs || []).some(x => x.kind === 'odai' && x.state === 'ok'), hint: '「判定」タブ。見本写真と見比べて' },
    { t: '届いた写真を1枚「却下」にする（理由も選んで）', ok: S => (S.subs || []).some(x => x.state === 'ng'), hint: '「却下：条件が写っていない」など' },
    { t: '接触：合言葉を言いに来た人の名前を押す', ok: S => (S.contacts || []).some(c => c.slots.some(x => x.who.some(w => w.done))), hint: '上の「接触メモ」か「接触」タブ' },
    { t: '緊急任務の写真を「認める」で解除する', ok: S => (S.sabotage || []).some(z => z.state === 'cleared'), hint: '2枚判定すると妨害が起きます。写真は「判定」に届きます' },
    { t: '「行動を終えて作戦会議へ」を押す', ok: S => ['meeting', 'vote', 'result', 'end'].includes(S.game.phase) },
    { t: '3チームの確保写真を採点する', ok: S => (S.kakuho || []).every(k => !k.sub || k.score != null) && ['meeting', 'vote', 'result', 'end'].includes(S.game.phase), hint: '「確保の採点」で項目にチェック →「この点数で保存」' },
    { t: '「投票の時間へ」→「結果を発表する」', ok: S => ['result', 'end'].includes(S.game.phase) },
    { t: '「結果」で点数を確かめる', ok: () => !!store('resSeen'), hint: '「結果」タブ' },
  ],
};
function renderTasks(mode) {
  const S = G.S; if (!S) return;
  const L = TASKS[mode], done = L.map(x => { try { return !!x.ok(S); } catch { return false; } });
  const cur = done.indexOf(false), n = done.filter(Boolean).length;
  let el = document.getElementById('g-tasks');
  if (!el) { el = document.createElement('aside'); el.id = 'g-tasks'; el.setAttribute('aria-label', '課題'); document.body.appendChild(el); }
  const open = store('open') ?? window.innerWidth > 700;   // スマホでは最初はたたんで、いまの課題だけ出す
  el.style.cssText = `position:fixed;z-index:25;left:12px;${isGmPage ? 'bottom:12px' : 'bottom:76px'};width:min(360px,calc(100% - 24px));background:var(--panel);border:2px solid var(--sign);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:10px 12px;max-height:${open ? '46vh' : 'auto'};overflow:auto`;
  el.innerHTML = `<div class="row" style="justify-content:space-between"><b>やってみる　${n}/${L.length}</b><button class="btn ghost small" type="button" data-gt="toggle">${open ? 'たたむ' : 'ひらく'}</button></div>
  ${open ? `<ol style="list-style:none;padding:0;margin:8px 0 0;display:grid;gap:6px">${L.map((x, i) => `<li style="display:grid;grid-template-columns:20px 1fr;gap:6px;${i === cur ? 'background:var(--warn-bg);border-radius:6px;padding:6px;' : done[i] ? 'color:var(--sub);' : ''}"><span style="font-weight:700;color:${done[i] ? 'var(--ok)' : 'var(--sub)'}">${done[i] ? '✓' : i === cur ? '▶' : '・'}</span><span>${esc(x.t)}${i === cur && x.hint ? `<br><span class="sub">${esc(x.hint)}</span>` : ''}</span></li>`).join('')}</ol>` : (cur >= 0 ? `<p class="sub" style="margin:6px 0 0">▶ ${esc(L[cur].t)}</p>` : '')}
  ${cur < 0 ? '<p style="margin:8px 0 0"><b>全部できました。</b>本番でも同じ流れです。<a href="/">トップへ</a></p>' : ''}`;
}
function startTasks(mode) {
  document.addEventListener('click', e => {
    if (e.target.closest('[data-gt="toggle"]')) { store('open', !(store('open') ?? window.innerWidth > 700)); renderTasks(mode); }
    const t = e.target.closest('[data-tab]');
    if (t?.dataset.tab === 'clue') store('clueSeen', true);
    if (t?.dataset.tab === 'res') store('resSeen', true);
    if (e.target.closest('.reveal .lid')) store('roleSeen', true);
    setTimeout(() => renderTasks(mode), 300);
  });
  G.afterState = () => renderTasks(mode);
  setInterval(() => renderTasks(mode), 3000);
  renderTasks(mode);
}

// どちらを動かすかは、ゲームのモードで決める
function boot() {
  const m = G.S?.game?.mode;
  if (!G.S) { setTimeout(boot, 300); return; }
  if (!G.S.game.demo || !m) return;
  if ((m === 'tour-player' && !isGmPage) || (m === 'tour-gm' && isGmPage)) startTour(m);
  if ((m === 'try-player' && !isGmPage) || (m === 'try-gm' && isGmPage)) startTasks(m);
}
boot();
})();
