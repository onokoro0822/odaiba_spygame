// トップページの「動く紹介」。参加者のスマホとGMのスマホを並べ、1タームの流れを自動で見せる。
// 中身は本物の画面を小さく描き直したもので、写真は絵（SVG）。実際のゲームの通信はしない
(() => {
const root = document.getElementById('intro');
if (!root) return;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 写真の代わりの絵（モールの吹き抜け）
const pic = (hue = 205) => `<svg viewBox="0 0 160 100" class="i-pic" aria-hidden="true"><rect width="160" height="100" fill="hsl(${hue} 35% 86%)"/>
  <rect x="0" y="62" width="160" height="38" fill="hsl(${hue} 18% 74%)"/><rect x="18" y="16" width="34" height="46" fill="hsl(${hue} 30% 70%)"/><rect x="108" y="16" width="34" height="46" fill="hsl(${hue} 30% 70%)"/>
  <ellipse cx="80" cy="74" rx="34" ry="9" fill="hsl(${hue} 20% 64%)"/><circle cx="80" cy="34" r="10" fill="#F3C43C"/><path d="M60 10h40" stroke="#fff" stroke-width="3"/></svg>`;
const bar = (name, sub, right) => `<div class="i-bar"><span class="i-dot">?</span><span><b>${name}</b><small>${sub}</small></span><span class="i-clock">${right}</span></div>`;

// 場面：p＝参加者のスマホ、g＝GMのスマホ、tap＝指で押す場所（どちらのスマホか＋ボタンの印）
const S = [
  { cap: '3チームに分かれ、個人ページに役職が届きます。まわりに見えないよう、タップしたときだけ表示します。', tap: 'p:.i-lid',
    p: bar('アオサギ', 'Aチーム　ターム1', '役職発表') + `<div class="i-body"><div class="i-card i-reveal"><div class="i-lid">タップして役職を見る</div><div class="i-face"><small>あなたの役職</small><b class="i-red">内通者</b><span>答えの写真を知っている敵。嘘と誘導でチームを遠ざける。</span></div></div></div>`,
    g: bar('GM手帳', 'ターム1', '役職発表') + `<div class="i-body"><div class="i-card i-hl"><b>台本</b><ol class="i-list"><li class="i-done">✓ 役職を発表する</li><li class="i-now">▶ 行動を開始する</li><li>・ 11:48 内通者を待つ</li><li>・ 写真を判定する</li></ol></div></div>` },
  { cap: '行動が始まると、お題が3つ公開されます。写真を撮って出すと、GMに届きます。3チームで早い者勝ちです。', tap: 'p:.i-btn',
    p: bar('アオサギ', 'Aチーム　ターム1', '行動中 58:12') + `<div class="i-body"><div class="i-card"><span class="i-no">1</span><b>調査写真の撮影</b><p>「巨大なイカの像の、足元まで写した証拠写真を押さえてこい」</p><span class="i-btn">写真を撮って出す</span></div><div class="i-card i-dim"><span class="i-no">2</span><b>調査写真の撮影</b><p>「青い時計台の文字盤を撮ってこい」</p></div></div>`,
    g: bar('GM手帳', 'ターム1', '行動中 58:12') + `<div class="i-body"><div class="i-card"><b>判定待ち</b><p class="i-sub">届くと、ここに並びます</p></div></div>` },
  { cap: 'GMの手帳には、投稿の早い順に写真が並びます。下見の見本と見比べて「獲得」を押すだけです。', tap: 'g:.i-ok',
    p: bar('アオサギ', 'Aチーム　ターム1', '行動中 57:40') + `<div class="i-body"><div class="i-card"><span class="i-no">1</span><b>調査写真の撮影</b><p>「巨大なイカの像の、足元まで…」</p><span class="i-st">判定待ち</span></div></div>`,
    g: bar('GM手帳', 'ターム1', '行動中 57:40') + `<div class="i-body"><div class="i-card"><div class="i-two">${pic(205)}${pic(30)}</div><small class="i-sub">投稿　／　見本（下見）</small><b>お題1　Aチーム　アオサギ</b><div class="i-row"><span class="i-ok">獲得</span><span class="i-ng">却下</span></div></div></div>` },
  { cap: '認められると、出した人にだけ手掛かりが届きます。口で伝えてもいいけれど、画面を見せるのは禁止です。', tap: '',
    p: bar('アオサギ', 'Aチーム　ターム1', '行動中 57:31') + `<div class="i-body"><div class="i-toast">1番目の獲得：手掛かり</div><div class="i-card i-hl"><small>届いたもの</small><b>1番目の獲得：手掛かり</b><p>「3階か。だいぶ高いところだな。」</p></div></div>`,
    g: bar('GM手帳', 'ターム1', '行動中 57:31') + `<div class="i-body"><div class="i-card"><b>最近の判定</b><p class="i-sub">お題1　Aチーム　<span class="i-okt">認めた</span></p><p class="i-sub">次のお題（4）が自動で公開</p></div></div>` },
  { cap: '内通者・密使・蜃気楼は、決まった時間と場所でGMに合言葉を言いに来ます。GMは会えた人の名前を押すだけ。', tap: 'g:.i-btn',
    p: bar('アオサギ', 'Aチーム　ターム1', '行動中 51:58') + `<div class="i-body"><div class="i-card"><b>GMとの接触</b><p>合言葉 <span class="i-pw">波</span></p><p class="i-now2">11:48〜11:53　2階 船のベンチの前　いまの時間です</p></div></div>`,
    g: bar('GM手帳', 'ターム1', '行動中 51:58') + `<div class="i-body"><div class="i-card i-hl"><b>いまの接触　<span class="i-chip">内通者</span></b><p>2階 船のベンチの前　合言葉 <span class="i-pw">波</span></p><div class="i-row"><span class="i-btn">アオサギ（A）に会えた</span></div></div></div>` },
  { cap: '伝える内容は自動で届きます。内通者は妨害の権利を手に入れ、緊急任務で全チームの足を止められます。', tap: 'p:.i-ngb',
    p: bar('アオサギ', 'Aチーム　ターム1', '行動中 51:40') + `<div class="i-body"><div class="i-card"><small>届いたもの</small><b>接触成功（1回目）</b><p>妨害を1回発動できます。</p></div><div class="i-card"><b>妨害</b><p>使える権利：1回</p><span class="i-ngb">妨害を発動する</span></div></div>`,
    g: bar('GM手帳', 'ターム1', '行動中 51:40') + `<div class="i-body"><div class="i-card"><b>接触</b><p class="i-sub">✓ アオサギ（A）</p></div></div>` },
  { cap: '緊急任務：「〇階で3人以上で写れ」。写真が認められるまで、全チームがお題を獲得できません。', tap: '',
    p: bar('アオサギ', 'Aチーム　ターム1', '行動中 51:32') + `<div class="i-body"><div class="i-card i-alert"><b>緊急任務：Aチーム</b><p>2階で、Aチームの3人以上で写れ。全チームお題を獲得できません。</p></div></div>`,
    g: bar('GM手帳', 'ターム1', '行動中 51:32') + `<div class="i-body"><div class="i-card i-alert"><b>緊急任務：Aチーム</b><p class="i-sub">写真は「判定」に届きます</p></div></div>` },
  { cap: '行動のあとは作戦会議。チームの中で、誰が内通者・密使・蜃気楼だったかを一人ひとり投票します。', tap: 'p:.i-btn',
    p: bar('アオサギ', 'Aチーム　ターム1', '作戦会議') + `<div class="i-body"><div class="i-card"><b>投票</b><p class="i-sub">密使だと思う人</p><div class="i-sel">イタチ</div><p class="i-sub">蜃気楼だと思う人</p><div class="i-sel">ツバメ</div><span class="i-btn">投票する</span></div></div>`,
    g: bar('GM手帳', 'ターム1', '作戦会議') + `<div class="i-body"><div class="i-card"><b>確保の採点</b><ul class="i-checks"><li>☑ 3階から撮っている</li><li>☑ 横向きで撮っている</li><li>☐ 噴水が写っている</li></ul></div></div>` },
  { cap: '結果発表。確保写真の点数と正体と投票から、全員の点数が自動で出ます。3タームの合計でMVPが決まります。', tap: '',
    p: bar('アオサギ', 'Aチーム　ターム1', '結果発表') + `<div class="i-body"><div class="i-card i-hl"><span class="i-chip">内通者</span><p>あなたの点数 <b class="i-big">31</b> 点</p></div><div class="i-card"><div class="i-rank"><span style="--w:92%">ワシ 38</span><span style="--w:80%">アオサギ 31</span><span style="--w:64%">タカ 25</span></div></div></div>`,
    g: bar('GM手帳', 'ターム1', '結果発表') + `<div class="i-body"><div class="i-card"><b>結果</b><div class="i-rank"><span style="--w:92%">ワシ 38</span><span style="--w:80%">アオサギ 31</span><span style="--w:64%">タカ 25</span></div></div></div>` },
];

root.innerHTML = `<div class="i-stage"><figure class="i-phone" data-k="p"><figcaption>参加者のスマホ</figcaption><div class="i-screen"></div><span class="i-finger" aria-hidden="true"></span></figure>
  <figure class="i-phone" data-k="g"><figcaption>GMのスマホ</figcaption><div class="i-screen"></div><span class="i-finger" aria-hidden="true"></span></figure></div>
  <p class="i-cap" aria-live="polite"></p>
  <div class="i-ctl"><button type="button" class="btn ghost small" data-i="prev" aria-label="前へ">◀</button><span class="i-dots">${S.map((_, i) => `<button type="button" data-i="${i}" aria-label="${i + 1}番目"></button>`).join('')}</span><button type="button" class="btn ghost small" data-i="play">一時停止</button><button type="button" class="btn ghost small" data-i="next" aria-label="次へ">▶</button></div>`;
const scr = { p: root.querySelector('[data-k="p"] .i-screen'), g: root.querySelector('[data-k="g"] .i-screen') };
const fin = { p: root.querySelector('[data-k="p"] .i-finger'), g: root.querySelector('[data-k="g"] .i-finger') };
let i = 0, playing = !reduce, timer = null, tapT = null;

function show(n) {
  i = (n + S.length) % S.length;
  const s = S[i];
  for (const k of ['p', 'g']) { scr[k].classList.remove('in'); scr[k].innerHTML = s[k]; void scr[k].offsetWidth; scr[k].classList.add('in'); fin[k].classList.remove('go'); }
  root.querySelector('.i-cap').textContent = `${i + 1}／${S.length}　${s.cap}`;
  root.querySelectorAll('.i-dots button').forEach((b, j) => b.setAttribute('aria-current', j === i ? 'step' : 'false'));
  clearTimeout(tapT);
  if (s.tap) {
    const [k, sel] = s.tap.split(':');
    tapT = setTimeout(() => {
      const t = scr[k].querySelector(sel); if (!t) return;
      const a = t.getBoundingClientRect(), b = scr[k].parentElement.getBoundingClientRect();
      fin[k].style.left = `${a.left - b.left + a.width / 2}px`; fin[k].style.top = `${a.top - b.top + a.height / 2}px`;
      fin[k].classList.add('go');
      setTimeout(() => { t.classList.add('i-pressed'); if (sel === '.i-lid') t.parentElement.classList.add('open'); }, 650);
    }, reduce ? 0 : 900);
  }
  clearTimeout(timer);
  if (playing) timer = setTimeout(() => show(i + 1), 5200);
}
root.addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  const v = b.dataset.i;
  if (v === 'play') { playing = !playing; b.textContent = playing ? '一時停止' : '再生'; show(i); return; }
  if (v === 'prev') return show(i - 1);
  if (v === 'next') return show(i + 1);
  show(Number(v));
});
// 画面に入ってから動かす（見えないところで回さない）
new IntersectionObserver(es => { for (const e of es) { if (e.isIntersecting) { show(i); } else clearTimeout(timer); } }, { threshold: 0.3 }).observe(root);
if (reduce) root.querySelector('[data-i="play"]').textContent = '再生';
})();
