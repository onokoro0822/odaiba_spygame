// シナリオ編集（/edit）。保存すると、そのあとに作るゲームとデモから使われる（進行中のゲームは変わらない）
(() => {
const { esc, $ } = G;
const ROLES = ['内通者', '密使', '蜃気楼'];
const KINDS = ['手掛かり', '割符①', '割符②', '割符③', '割符④'];
let key = '', D = null, tab = 'all', dirty = false, updated = null;
try { key = sessionStorage.getItem('edit-key') || ''; } catch { /* 保存できなくても動く */ }

const post = (x) => G.api('scenario', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, ...x }) });

function login(msg) {
  $('#savebar').classList.add('hide'); $('#tabs').classList.add('hide');
  $('#main').innerHTML = `<div style="max-width:520px"><h1>シナリオ編集</h1><p>お題の指令や条件、手掛かり・割符、採点の項目、接触の場所と合言葉を直せます。保存すると、そのあとに作るゲームとデモから使われます。進行中のゲームは変わりません。</p>
  ${msg ? `<p class="notice">${esc(msg)}</p>` : ''}<form class="card" id="login"><label class="f" for="key">主催者の鍵</label><input type="password" id="key" autocomplete="off" required><div class="row" style="margin-top:12px"><button class="btn wide" type="submit">開く</button></div></form></div>`;
}
async function load() {
  try { const r = await post({ op: 'get' }); D = r.data; updated = r.updated; dirty = false; render(); }
  catch (e) { key = ''; try { sessionStorage.removeItem('edit-key'); } catch { /* なし */ } login(e.message); }
}

// ---------- 画面 ----------
const inp = (path, v, attrs = '') => `<input type="text" data-path="${path}" value="${esc(v)}" ${attrs}>`;
const area = (path, v, rows = 3) => `<textarea data-path="${path}" rows="${rows}">${esc(v)}</textarea>`;
const ops = (list, i, n) => `<div class="ops"><button class="btn ghost small" type="button" data-move="${list}" data-i="${i}" data-d="-1"${i === 0 ? ' disabled' : ''} aria-label="上へ">↑</button><button class="btn ghost small" type="button" data-move="${list}" data-i="${i}" data-d="1"${i === n - 1 ? ' disabled' : ''} aria-label="下へ">↓</button><button class="btn ng small" type="button" data-del="${list}" data-i="${i}">消す</button></div>`;

function render() {
  $('#savebar').classList.remove('hide'); $('#tabs').classList.remove('hide');
  $('#status').innerHTML = dirty ? '<span class="dirty">保存していない変更があります</span>' : updated ? `保存済み（${new Date(updated).toLocaleString('ja-JP')}）` : 'まだ編集していません（最初の内容）';
  const T = [['all', '全体'], ...D.terms.map((x, i) => [String(i), `ターム${i + 1}`])];
  $('#tabs').innerHTML = T.map(([id, l]) => `<button type="button" data-tab="${id}"${id === tab ? ' aria-current="page"' : ''}>${l}</button>`).join('');
  $('#main').innerHTML = tab === 'all' ? all() : term(Number(tab));
  loadThumbs();
}
function all() {
  return `<h1>全体</h1><div class="card"><label class="f">ゲームの名前</label>${inp('title', D.title)}<label class="f">ひとことの説明</label>${inp('subtitle', D.subtitle || '')}</div>
  <h2>張り込みの「瞬間」</h2><p class="sub">内通者が撮る張り込みの候補です。1行に1つ。ターム開始のときに、ここから選ばれます。</p>
  <div class="card"><textarea data-lines="harikomiActions" rows="12">${esc((D.harikomiActions || []).join('\n'))}</textarea></div>
  <p class="sub">役職名、点数のルール、時間配分は、ここでは変えられません。</p>`;
}
function term(i) {
  const T = D.terms[i], P = `terms.${i}`;
  let h = `<h1>ターム${i + 1}　<span class="sub">${esc(T.mall)}</span></h1>`;
  h += `<div class="card"><div class="mini"><div><label class="f">モールの名前</label>${inp(`${P}.mall`, T.mall)}</div><div><label class="f">緊急任務で使う階（カンマ区切り）</label>${inp(`${P}.floors`, (T.floors || []).join(','))}</div></div>
    <label class="f">答えの写真の撮影場所（結果発表と内通者に出る）</label>${area(`${P}.answer`, T.answer, 2)}
    <label class="f">答えの写真</label>${photoField(`${P}.photo`, T.photo, '答えの写真')}</div>`;
  h += `<h2>お題 <span class="sub">${T.odai.length}個。上から順に${D.openCount || 3}個ずつ公開されます</span></h2>`;
  h += T.odai.map((o, j) => `<div class="card item"><div class="no">${j + 1}</div><div>
    <div class="mini"><div><label class="f">お題の名前</label>${inp(`${P}.odai.${j}.title`, o.title)}</div><div><label class="f">タグ（カンマ区切り。屋外、お金：100円 など）</label>${inp(`${P}.odai.${j}.tags`, (o.tags || []).join(','))}</div></div>
    <label class="f">指令</label>${area(`${P}.odai.${j}.order`, o.order, 3)}
    <label class="f">条件（GMが判定で見るところ）</label>${area(`${P}.odai.${j}.cond`, o.cond, 2)}
    <label class="f">見本写真（GMの判定画面に出る）</label>${photoField(`${P}.odai.${j}.sample`, o.sample ? (o.sample.startsWith('db:') ? o.sample : 'sample/' + o.sample) : '', '見本写真', true)}
    ${ops(`${P}.odai`, j, T.odai.length)}</div></div>`).join('');
  h += `<button class="btn ghost" type="button" data-add="${P}.odai">お題を足す</button>`;
  h += `<h2>手掛かりと割符 <span class="sub">${T.rewards.length}個。お題を獲得した順番に、上から1つずつ届きます</span></h2>`;
  h += T.rewards.map((r, j) => `<div class="card item"><div class="no">${j + 1}</div><div><div class="mini"><div><label class="f">種類</label><select data-path="${P}.rewards.${j}.kind">${KINDS.map(k => `<option${k === r.kind ? ' selected' : ''}>${k}</option>`).join('')}</select></div></div>
    <label class="f">届く文章</label>${area(`${P}.rewards.${j}.text`, r.text, 2)}${ops(`${P}.rewards`, j, T.rewards.length)}</div></div>`).join('');
  h += `<button class="btn ghost" type="button" data-add="${P}.rewards">手掛かりを足す</button>`;
  h += `<h2>確保写真の採点項目 <span class="sub">1つ1点。「密使に伝える」に印を付けた項目が、密使に届く本物の情報になります</span></h2>`;
  h += T.checks.map((c, j) => `<div class="card item"><div class="no">${j + 1}</div><div>${inp(`${P}.checks.${j}.item`, c.item)}
    <label style="display:inline-flex;gap:6px;align-items:center;margin-top:6px;font-size:14px"><input type="checkbox" data-path="${P}.checks.${j}.bep"${c.bep ? ' checked' : ''}> 密使に伝える</label>${ops(`${P}.checks`, j, T.checks.length)}</div></div>`).join('');
  h += `<button class="btn ghost" type="button" data-add="${P}.checks">項目を足す</button>`;
  h += `<h2>GMとの接触 <span class="sub">時間は「行動開始の何分後か」（0〜60）</span></h2>`;
  h += ROLES.map(r => { const c = T.contacts?.[r] || { pw: '', slots: [] }; return `<div class="card r-${r}" style="border-left:6px solid var(--rc)"><div class="hd">${G.chip(r)}</div>
    <div class="mini"><div><label class="f">合言葉</label>${inp(`${P}.contacts.${r}.pw`, c.pw)}</div></div>
    ${c.slots.map((x, j) => `<div class="mini" style="margin-top:6px;grid-template-columns:90px 90px 1fr"><div><label class="f">${j + 1}回目 開始</label>${inp(`${P}.contacts.${r}.slots.${j}.from`, x.from, 'inputmode="numeric"')}</div><div><label class="f">終わり</label>${inp(`${P}.contacts.${r}.slots.${j}.to`, x.to, 'inputmode="numeric"')}</div><div><label class="f">場所</label>${inp(`${P}.contacts.${r}.slots.${j}.place`, x.place)}</div></div>`).join('')}</div>`; }).join('');
  return h;
}

// ---------- 写真 ----------
// ref：'db:<id>'（ここから上げたもの）か、public/_secret/ の下のファイル名
const thumbs = new Map();
function photoField(path, ref, label, removable) {
  return `<div class="row" style="align-items:flex-start;gap:10px">${ref ? `<img data-ref="${esc(ref)}" alt="${esc(label)}" style="width:160px;aspect-ratio:4/3;object-fit:cover;border-radius:6px;background:var(--line)">` : `<span class="sub" style="width:160px">まだありません</span>`}
    <span class="row"><button class="btn ghost small" type="button" data-photo="${path}">${ref ? '写真を変える' : '写真を上げる'}</button>${removable && ref ? `<button class="btn ng small" type="button" data-unphoto="${path}">外す</button>` : ''}</span></div>`;
}
async function loadThumbs() {
  for (const img of document.querySelectorAll('img[data-ref]')) {
    const ref = img.dataset.ref;
    if (!thumbs.has(ref)) {
      thumbs.set(ref, fetch('/api/scenario', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, op: 'photo', ref }) })
        .then(r => r.ok ? r.blob() : null).then(b => b && URL.createObjectURL(b)));
    }
    const u = await thumbs.get(ref); if (u) img.src = u;
  }
}
async function uploadPhoto(path) {
  const f = await G.pickPhoto(); if (!f) return;
  G.toast('上げています…');
  try {
    const b = await G.shrink(f, 1600, 0.82);
    const r = await fetch(`/api/scenario-photo?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: b });
    const d = await r.json(); if (!r.ok) throw new Error(d.error);
    setPath(path, d.ref); changed(); render(); G.toast('写真を入れました。保存すると使われます');
  } catch (e) { G.toast(e.message || '上げられませんでした', true); }
}

// ---------- 値の読み書き ----------
function setPath(path, v) {
  const k = path.split('.'), last = k.pop();
  let o = D; for (const x of k) o = o[/^\d+$/.test(x) ? Number(x) : x];
  if (last === 'tags' || last === 'floors') v = String(v).split(/[,、]/).map(s => s.trim()).filter(Boolean);
  if (last === 'from' || last === 'to') v = Number(v);
  o[last] = v;
}
const getList = path => path.split('.').reduce((o, x) => o[/^\d+$/.test(x) ? Number(x) : x], D);
function changed() { dirty = true; $('#status').innerHTML = '<span class="dirty">保存していない変更があります</span>'; }
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.path) { setPath(el.dataset.path, el.type === 'checkbox' ? el.checked : el.value); changed(); }
  if (el.dataset.lines) { D[el.dataset.lines] = el.value.split('\n').map(s => s.trim()).filter(Boolean); changed(); }
});
document.addEventListener('change', e => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true })); });
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

document.addEventListener('submit', e => {
  if (e.target.id !== 'login') return;
  e.preventDefault(); key = $('#key').value; try { sessionStorage.setItem('edit-key', key); } catch { /* なし */ } load();
});
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.photo) { uploadPhoto(d.photo); return; }
  if (d.unphoto) { setPath(d.unphoto, ''); changed(); render(); return; }
  if (d.add) {
    const L = getList(d.add);
    L.push(d.add.endsWith('odai') ? { title: '調査写真の撮影', order: '', cond: '', tags: [] } : d.add.endsWith('rewards') ? { kind: '手掛かり', text: '' } : { item: '', bep: false });
    changed(); render(); return;
  }
  if (d.del) { const L = getList(d.del); if (!confirm(`${Number(d.i) + 1}番目を消しますか？`)) return; L.splice(Number(d.i), 1); changed(); render(); return; }
  if (d.move) { const L = getList(d.move), i = Number(d.i), j = i + Number(d.d); [L[i], L[j]] = [L[j], L[i]]; changed(); const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  if (d.op === 'save') {
    b.disabled = true;
    try { const r = await post({ op: 'save', data: D }); D = r.data; updated = r.updated; dirty = false; render(); G.toast('保存しました。次に作るゲームから使われます'); }
    catch (err) { alert('保存できませんでした。\n' + err.message); }
    b.disabled = false; return;
  }
  if (d.op === 'reset') { if (!confirm('編集した内容をすべて消して、最初の内容（10/4のもの）に戻しますか？')) return; await post({ op: 'reset' }); G.toast('最初の内容に戻しました'); load(); return; }
  if (d.op === 'export') {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(D, null, 1)], { type: 'application/json' }));
    a.download = `scenario-${new Date().toISOString().slice(0, 10)}.json`; a.click(); return;
  }
  if (d.op === 'import') {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
    i.onchange = async () => { try { const x = JSON.parse(await i.files[0].text()); if (!Array.isArray(x.terms)) throw new Error(); D = x; changed(); render(); G.toast('読み込みました。確かめてから保存してください'); } catch { G.toast('読み込めませんでした', true); } };
    i.click();
  }
});

if (key) load(); else login();
})();
