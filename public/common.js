// 個人ページとGM手帳で共通の道具
const G = window.G = {};
G.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
G.$ = s => document.querySelector(s);
G.key = location.pathname.split('/').filter(Boolean)[1] || '';
G.PHASE = { setup: '開始前', brief: '役職発表', action: '行動中', meeting: '作戦会議', vote: '投票', result: '結果発表', end: '終了' };
G.ROLE_KEY = { 内通者: 's', 密使: 'b', 蜃気楼: 't' };
G.chip = r => r ? `<span class="chip r-${G.esc(r)}">${G.esc(r)}</span>` : '<span class="chip none">休み</span>';
G.team = t => t ? `<span class="chip team">${G.esc(t)}チーム</span>` : '';
G.hm = ms => { const d = new Date(ms); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
G.mmss = ms => { ms = Math.max(0, ms); const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
G.store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } },
};

G.toast = (text, err) => {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.setAttribute('role', err ? 'alert' : 'status'); el.textContent = text;
  document.body.appendChild(el); setTimeout(() => el.remove(), err ? 5000 : 2600);
};

G.api = async (path, opt = {}) => {
  const r = await fetch('/api/' + path, opt);
  const d = await r.json().catch(() => ({ error: '通信に失敗しました' }));
  if (!r.ok) throw new Error(d.error || '通信に失敗しました');
  return d;
};
G.act = (type, x = {}) => G.api('act', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: G.key, type, ...x }) });

// サーバーとの時計のずれを直して、残り時間を出す
G.skew = 0;
G.now = () => Date.now() + G.skew;

// 状態を数秒おきに取りに行く。画面が隠れているあいだは止める
G.poll = (onState, every = 4000) => {
  let v = '', timer = null, busy = false;
  async function tick() {
    clearTimeout(timer);
    if (busy) return; busy = true;
    try {
      const d = await G.api(`state?k=${encodeURIComponent(G.key)}&v=${v}`);
      G.skew = d.now - Date.now();
      if (!d.same) { v = d.v; onState(d); }
      G.offline(false);
    } catch (e) {
      if (/見つかりません/.test(e.message)) { onState({ error: e.message }); busy = false; return; }
      G.offline(true);
    }
    busy = false;
    if (document.visibilityState === 'visible') timer = setTimeout(tick, every);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  G.refresh = () => { v = ''; tick(); };
  G.nudge = tick;
  tick();
};
G.offline = on => {
  let el = G.$('#offline');
  if (!on) { el?.remove(); return; }
  if (el) return;
  el = document.createElement('div'); el.id = 'offline'; el.className = 'notice'; el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;top:64px;left:16px;right:16px;z-index:20;text-align:center';
  el.textContent = '電波が弱いようです。つながりしだい、自動で読み直します。';
  document.body.appendChild(el);
};

// 写真を小さくしてから送る（位置情報などの付加情報もここで消える）
G.shrink = (file, max = 1600, q = 0.8) => new Promise((res, rej) => {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob(b => b ? res(b) : rej(new Error('写真を読み込めませんでした')), 'image/jpeg', q);
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('写真を読み込めませんでした')); };
  img.src = url;
});
G.pickPhoto = () => new Promise(res => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment');
  i.onchange = () => res(i.files[0] || null); i.click();
});
G.upload = async (kind, ref) => {
  const f = await G.pickPhoto(); if (!f) return null;
  G.toast('送っています…');
  const b = await G.shrink(f);
  return G.api(`up?k=${encodeURIComponent(G.key)}&kind=${kind}${ref != null ? '&ref=' + ref : ''}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: b });
};
G.img = id => `/api/img?k=${encodeURIComponent(G.key)}&id=${id}`;
G.answerImg = t => `/api/answer?k=${encodeURIComponent(G.key)}&t=${t}`;

// 残り時間の表示
G.clockHTML = (game) => {
  const d = game.dur, ph = game.phase;
  let end = null;
  if (ph === 'action' && game.action_at) end = game.action_at + d.action * 60000;
  if (ph === 'meeting' && game.phase_at) end = game.phase_at + d.meeting * 60000;
  if (ph === 'vote' && game.phase_at) end = game.phase_at + d.vote * 60000;
  // 始まる前は、行動開始の予定までを数える（1時間より先なら時刻だけ出す）
  const nextT = ph === 'setup' ? 1 : ph === 'brief' ? game.term : null, at = nextT && game.plan?.at?.[nextT];
  if (end == null && at && at > G.now()) {
    if (at - G.now() > 3600000) { const d = new Date(at), today = new Date(G.now()).toDateString() === d.toDateString(); return `<div class="clock"><span class="ph">ターム${nextT}の開始</span><span class="tm" style="font-size:18px">${today ? '' : `${d.getMonth() + 1}/${d.getDate()} `}${G.hm(at)}</span></div>`; }
    return `<div class="clock" data-end="${at}"><span class="ph">ターム${nextT}の開始まで</span><span class="tm">${G.mmss(at - G.now())}</span></div>`;
  }
  if (end == null) return `<div class="clock"><span class="ph">${G.PHASE[ph]}</span><span class="tm" style="font-size:16px">${game.term ? `ターム${game.term}` : ''}</span></div>`;
  const left = end - G.now();
  return `<div class="clock${left < 5 * 60000 ? ' low' : ''}" data-end="${end}"><span class="ph">${G.PHASE[ph]}・のこり</span><span class="tm">${G.mmss(left)}</span></div>`;
};
setInterval(() => document.querySelectorAll('.clock[data-end]').forEach(el => {
  const left = Number(el.dataset.end) - G.now();
  el.querySelector('.tm').textContent = G.mmss(left); el.classList.toggle('low', left < 5 * 60000);
}), 1000);

// 役職ごとの任務と点数（当日の文面をもとに短くしたもの）
G.ROLE_INFO = {
  公安: { goal: '手掛かりとみんなの行動から、チームに紛れた内通者・密使・蜃気楼の正体を見抜く。', pts: ['確保点（0〜20）はチーム共通', '確保点が全チームでいちばん高ければトップ賞 ＋8', '投票で内通者を当てて ＋5、密使 ＋4、蜃気楼 ＋3', '内通者に自分のチームの密使を当てられたら −5'] },
  密使: { goal: '答えの写真について本物の情報を3つ知っている。正体がばれないように、さりげなくチームを導く。接触に成功するたびに、チームの公安を1人教えてもらえる。', pts: ['確保点（0〜20）はチーム共通。トップ賞 ＋3', '教えてもらった3項目が確保写真に入るごとに ＋2', '投票で内通者を当てて ＋5、蜃気楼 ＋6', '蜃気楼に当てられたら −2', '内通者に当てられたら、個人点が最後に半分'] },
  蜃気楼: { goal: '内通者寄りの第三陣営。1回目の接触でチームの内通者が分かり、2回目の接触で妨害を1回発動できる。', pts: ['内通者を当てられなかった公安・密使1人につき ＋2', '蜃気楼を内通者だと書いた人1人につき ＋2', 'チームで妨害が1回発動するごとに ＋3（最大4回）', '投票で密使を当てたら ＋6、内通者が密使を当てたら ＋6', '正体を当てた人1人につき −3、密使に当てられたらさらに −5'] },
  内通者: { goal: '答えの写真を知っている。嘘や誘導で、チームを答えから遠ざける。接触に成功するたび、張り込みが達成されるたびに、妨害を発動できる。', pts: ['（20 − 自分のチームの確保点）× 2', '自分を当てなかった人（蜃気楼を除く）1人につき ＋3', '投票で密使を当てたら ＋8'] },
};

// 画面を丸ごと作り直さず、変わったところだけ書き換える。
// 自動の更新と同時にボタンを押しても、押したボタンが消えて空振りしないようにするため
G.patch = (el, html) => {
  const t = document.createElement('template'); t.innerHTML = html;
  morphChildren(el, t.content);
};
function morphChildren(a, b) {
  const A = [...a.childNodes], Bn = [...b.childNodes];
  Bn.forEach((nb, i) => {
    const na = A[i];
    if (!na) { a.appendChild(nb); return; }
    if (na.isEqualNode(nb)) return;
    if (na.nodeType !== nb.nodeType || na.nodeName !== nb.nodeName || (na.nodeType === 1 && na.tagName === 'IMG' && na.getAttribute('src') !== nb.getAttribute('src'))) { a.replaceChild(nb, na); return; }
    if (na.nodeType !== 1) { na.nodeValue = nb.nodeValue; return; }
    for (const { name } of [...na.attributes]) if (!nb.hasAttribute(name)) na.removeAttribute(name);
    for (const { name, value } of [...nb.attributes]) if (na.getAttribute(name) !== value) na.setAttribute(name, value);
    // 入力欄は、打っている途中の値を消さない
    if (na.tagName === 'SELECT' || na.tagName === 'INPUT' || na.tagName === 'TEXTAREA') { if (document.activeElement !== na) { if ('checked' in nb && na.type === 'checkbox') na.checked = nb.hasAttribute('checked'); } }
    morphChildren(na, nb);
  });
  for (let i = A.length - 1; i >= Bn.length; i--) A[i].remove();
}
