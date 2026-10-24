(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const chip=r=>r?`<span class="chip r-${esc(r)}">${esc(r)}</span>`:'<span class="chip none">欠席</span>';
const MALL_SHORT={1:'ダイバーシティ',2:'アクアシティ',3:'デックス'};
let D=null;

const ROLES=[
  ['公安','味方','各チーム2〜3人。手掛かりとみんなの行動から、内通者・密使・蜃気楼の正体を見抜く。'],
  ['密使','味方','各チーム1人。答えの一部を密かに知らされている。正体を隠しながら、チームを正解に導く。'],
  ['蜃気楼','第三陣営','各チーム1人。内通者寄り。疑われるほど得をし、妨害が起きるほど点が入る。'],
  ['内通者','敵','各チーム1人。最初から答えの写真を見ている裏切り者。嘘と妨害でチームを答えから遠ざける。']
];

function floors(page,t){
  return `<nav class="floors" aria-label="ターム">${[1,2,3].map(i=>`<a href="#/${page}/${i}"${i===t?' aria-current="page"':''}><span class="n">${i}</span>${MALL_SHORT[i]}</a>`).join('')}</nav>`;
}
function totals(){
  const m={};
  D.players.forEach(p=>m[p]={name:p,t:{1:null,2:null,3:null},role:{},team:{},sum:0});
  D.scores.forEach(s=>{const x=m[s.name];x.t[s.t]=s.pt;x.role[s.t]=s.role;x.team[s.t]=s.team;x.sum+=s.pt});
  const arr=Object.values(m).sort((a,b)=>b.sum-a.sum);
  arr.forEach((x,i)=>x.rank=i&&x.sum===arr[i-1].sum?arr[i-1].rank:i+1);
  return arr;
}
function rankBy(list,key){list.sort((a,b)=>b[key]-a[key]);list.forEach((x,i)=>x.rank=i&&x[key]===list[i-1][key]?list[i-1].rank:i+1);return list}

/* ---------- pages ---------- */
function home(){
  const top=totals().slice(0,3);
  return `<h1>お台場の3つのモールで遊んだ、スパイゲームの記録</h1>
  <p class="lead">16人が3チームに分かれ、モールを回ってお題の写真を撮り、届く手掛かりから「答えの写真」の撮影場所を探しました。チームの中には、答えを知っている内通者が紛れています。</p>
  <p class="sub">2026年10月4日（日）　ダイバーシティ東京プラザ → アクアシティお台場 → デックス東京ビーチ</p>
  <div class="board">${D.terms.map(t=>`<a href="#/answers/${t.t}"><span class="fl">${t.t}</span><span><span class="nm">${esc(t.mall)}</span><br><span class="tm">役職発表 ${t.start}　行動 ${t.a0}〜${t.a1}　投票 ${t.m1}</span></span><span class="go">答えを推理する</span></a>`).join('')}</div>
  <h2>4つの役職</h2>
  <p>タームごとにチームと役職を入れ替えて、3回遊びました。自分の役職は本人とGMしか知りません。</p>
  <div class="roles">${ROLES.map(r=>`<div class="role r-${r[0]}"><b>${r[0]}</b> <span class="sub">${r[1]}</span><p>${r[2]}</p></div>`).join('')}</div>
  <h2>総合順位</h2>
  <div class="podium">${top.map(x=>`<div><div class="rk">${x.rank}位</div><div class="nm">${esc(x.name)}</div><div class="pt">${x.sum}</div><div class="sub">点</div></div>`).join('')}</div>
  <p><a href="#/results">全員の点数と役職を見る</a></p>
  <h2>このサイトの見かた</h2>
  <p><a href="#/answers/1">答え</a>のページでは、当日と同じ順番で手掛かりを1つずつ開きながら、撮影場所を推理できます。<a href="#/missions/1">お題</a>には60個の指令、<a href="#/gm/1">GM手帳</a>には当日の進行と送った文面がそのまま残っています。</p>`;
}

function rules(){
  return `<div class="rules"><h1>ルール</h1>
  <section><p class="lead">ポイントハンティング×人狼×スパイミッション。5〜6人ずつの3チームでモールを回り、「答えの写真」にできるだけ近い写真を撮ることと、紛れ込んだ内通者を見つけることを目指します。</p></section>
  <section><h2>役職</h2>
  <div class="roles">${ROLES.map(r=>`<div class="role r-${r[0]}"><b>${r[0]}</b> <span class="sub">${r[1]}</span><p>${r[2]}</p></div>`).join('')}</div>
  <p>内通者・密使・蜃気楼は、3チーム分の同じ役職どうしでLINEグループに入ります。どのグループにも招待されなかった人が公安です。</p></section>
  <section><h2>お題と手掛かり</h2><ul>
  <li>お題は1タームに20個あり、3チーム共通・早い者勝ち。常に3個が公開され、どれかが獲得されると次の1個が出ます。</li>
  <li>獲得するたびに「手掛かり」か「割符の片方」が1つ、投稿した人にだけ届きます。中身はお題と関係なく、そのタームで何番目の獲得かで決まります。序盤は大まか、後になるほど細かくなります。</li>
  <li>割符は4組。「暗号電文と暗号書」や「破れた密書」の形で、2つそろうと意味が分かります。別のチームが持っていれば交換が必要です。</li>
  <li>手掛かりは口で伝えるだけ。画面を見せるのは禁止です。内通者と蜃気楼は嘘をついても構いません。</li></ul></section>
  <section><h2>GMとの接触と妨害</h2><ul>
  <li>内通者・密使・蜃気楼は、決められた時間と場所でGMに合言葉を言うと接触成功。1タームに2回あります。</li>
  <li>密使は成功するたびに、自分のチームの公安を1人教えてもらえます。蜃気楼は1回目でチームの内通者を知り、2回目で妨害の権利を得ます。内通者は成功すると妨害の権利を得ます。</li>
  <li>内通者には「仲間の誰かが〇〇している瞬間を撮る」張り込みの任務もあり、達成すると妨害の権利が増えます。</li>
  <li>妨害が発動すると「〇階で、3人以上で写れ」という緊急任務が出て、達成するまでお題を獲得できません。</li></ul></section>
  <section><h2>確保と投票</h2><ul>
  <li>行動60分のうちに1回だけ、答えに近づけた「確保写真」を投稿します。答えの写真に決めた20個のチェック項目と照らし合わせて、1つにつき1点（20点満点）。</li>
  <li>行動のあと10分の作戦会議をして、全員がフォームに「内通者」「密使」「蜃気楼」だと思う人を1人ずつ書きます。多数決ではなく、一人ひとりの回答を採点します。</li></ul></section>
  <section><h2>得点</h2>
  <div class="tw"><table><thead><tr><th>役職</th><th>点が入ること</th><th>点が減ること</th></tr></thead><tbody>
  <tr><td>${chip('公安')}</td><td>確保点（0〜20）。確保点が3チームでいちばん高ければトップ賞＋8。内通者を当てて＋5、密使＋4、蜃気楼＋3。</td><td>内通者に自分のチームの密使を当てられたら−5。</td></tr>
  <tr><td>${chip('密使')}</td><td>確保点（0〜20）。トップ賞＋3。教えてもらった3項目が確保写真に入るごとに＋2。内通者を当てて＋5、蜃気楼＋6。</td><td>蜃気楼に当てられたら−2。内通者に当てられたら個人点が最後に半減。</td></tr>
  <tr><td>${chip('蜃気楼')}</td><td>内通者を当てられなかった公安・密使1人につき＋2。蜃気楼を内通者だと書いた人1人につき＋2。チームで妨害が1回発動するごとに＋3（最大4回）。密使を当てて＋6、内通者が密使を当てたら＋6。</td><td>正体を当てた人1人につき−3。密使に当てられたらさらに−5。</td></tr>
  <tr><td>${chip('内通者')}</td><td>（20−自分のチームの確保点）×2。自分を当てなかった人（蜃気楼を除く）1人につき＋3。密使を当てて＋8。</td><td></td></tr>
  </tbody></table></div>
  <p>3タームの合計点がいちばん高い人がMVPです。</p></section>
  <section><h2>禁止事項</h2><ul>
  <li>GMからのLINEの画面や、役職のグループに入っていることを見せて証明すること。</li>
  <li>他人のスマホを無断で見ること。</li>
  <li>走る、追いかける、身体で撮影を邪魔する、通路をふさぐこと。撮影禁止の店内で撮ること。</li></ul></section></div>`;
}

function missions(t){
  const L=D.odai.filter(o=>o.t===t);const T=D.terms[t-1];
  return `<h1>お題　ターム${t}</h1>${floors('missions',t)}
  <p>${esc(T.mall)}の20個。上から順に公開され、常に3個が出ている状態で進みました。指令は「調査写真を撮ってこい」という本部からの連絡で、条件を満たした写真をアルバムに一番先に投稿したチームが獲得します。</p>
  <ul class="ms">${L.map(o=>{
    const tags=(o.memo||'').split('／').filter(Boolean);
    return `<li><span class="no">${o.no}</span><div><div class="tt">${esc(o.title)}</div><p class="od">${esc(o.order)}</p>${o.cond?`<div class="cd"><b>条件：</b>${esc(o.cond)}</div>`:''}${tags.length?`<div class="tags">${tags.map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>`:''}</div></li>`}).join('')}</ul>`;
}

const opened={};
function answers(t){
  const T=D.terms[t-1];const n=opened[t]??0;const rv=opened['r'+t];
  const C=D.check.filter(c=>c.t===t);
  const clues=T.rewards.map((r,i)=>i<n
    ?`<li class="${i===n-1?'new':''}"><span class="i">${i+1}</span><span><span class="k">${esc(r.kind)}</span>${esc(r.text)}</span></li>`
    :`<li class="hid"><span class="i">${i+1}</span><span>${i+1}番目の獲得で届いた${esc(r.kind.startsWith('割符')?'割符':'手掛かり')}</span></li>`).join('');
  return `<h1>答えの写真　ターム${t}</h1>${floors('answers',t)}
  <p>${esc(T.mall)}のどこかで撮られた1枚です。当日と同じ順番で手掛かりを開いて、撮影場所を推理してみてください。</p>
  <div class="ans">
    <div>
      <div class="ph${rv?' open':''}" id="ph"><img src="${esc(T.photo)}" alt="ターム${t}の答えの写真。${esc(T.answer)}" width="1600" height="1200">
        <div class="cover"><span class="pict" aria-hidden="true">?</span><span>手掛かりを開いてから見るのがおすすめです</span><button class="btn sign" type="button" data-act="reveal">答えの写真を見る</button></div></div>
      ${rv?`<div class="where"><b>撮影場所</b><br>${esc(T.answer)}</div>`:''}
    </div>
    <div>
      <div class="row"><button class="btn" type="button" data-act="next"${n>=20?' disabled':''}>${n===0?'1つ目の手掛かりを開く':'次を開く'}</button><button class="btn ghost" type="button" data-act="all"${n>=20?' disabled':''}>全部開く</button>${n?`<button class="btn ghost" type="button" data-act="reset">最初から</button>`:''}</div>
      <p class="sub" style="margin-top:8px">開いた数：${n}／20</p>
      <ol class="clues" aria-live="polite">${clues}</ol>
    </div>
  </div>
  ${rv?`<h2>採点のチェック項目（20点満点）</h2>
  <p>確保写真がこの項目に当てはまるごとに1点。<span class="mk">密使に伝えた</span>の3つは、密使だけがGMから最初に知らされていた項目です。</p>
  <div class="tw ck"><table><thead><tr><th>No</th><th>チェック項目</th><th>対応する手掛かり</th></tr></thead><tbody>
  ${C.map(c=>`<tr><td>${c.no}</td><td>${esc(c.item)} ${c.bep?'<span class="mk">密使に伝えた</span>':''}</td><td class="sub">${esc(c.src)}</td></tr>`).join('')}</tbody></table></div>
  <h2>各チームの確保点</h2>${teamTable(t)}`:''}`;
}
function teamTable(t){
  return `<div class="tw"><table><thead><tr><th>チーム</th><th class="num">確保点</th><th class="num">密使の3項目</th><th class="num">妨害の回数</th><th>トップ賞</th></tr></thead><tbody>
  ${D.teams.filter(x=>x.t===t).map(x=>`<tr${x.top?' class="first"':''}><td>${x.team}チーム</td><td class="num total">${x.kakuho}</td><td class="num">${x.bep3}／3</td><td class="num">${x.bougai}</td><td>${x.top?'トップ賞':''}</td></tr>`).join('')}</tbody></table></div>`;
}

function results(){
  const all=totals();
  let h=`<h1>結果</h1><p>3タームの合計点です。役職はタームごとに入れ替わりました。</p>
  <div class="tw"><table><thead><tr><th class="num">順位</th><th>コードネーム</th>${[1,2,3].map(t=>`<th>ターム${t}</th>`).join('')}<th class="num">合計</th></tr></thead><tbody>
  ${all.map(x=>`<tr${x.rank===1?' class="first"':''}><td class="num">${x.rank}</td><td><b>${esc(x.name)}</b></td>${[1,2,3].map(t=>`<td><span class="cell">${x.role[t]?`${chip(x.role[t])}<span class="sub">${x.team[t]}</span><b>${x.t[t]}</b>`:chip('')}</span></td>`).join('')}<td class="num total">${x.sum}</td></tr>`).join('')}</tbody></table></div>`;
  [1,2,3].forEach(t=>{
    const T=D.terms[t-1];
    const L=rankBy(D.scores.filter(s=>s.t===t).map(s=>({...s})),'pt');
    const teams=T.teams.map(tm=>{const m=L.filter(s=>s.team===tm);const g=r=>m.filter(s=>s.role===r).map(s=>s.name).join('、');return {tm,s:g('内通者'),b:g('密使'),te:g('蜃気楼'),k:g('公安')}});
    const hit=(s,key,role)=>{const truth=L.find(x=>x.team===s.team&&x.role===role);return truth&&truth.name!==s.name&&s.vote[key]===truth.name};
    h+=`<h2>ターム${t}　${esc(T.mall)}</h2>${teamTable(t)}
    <h3>正体</h3><div class="tw"><table><thead><tr><th>チーム</th><th>${chip('内通者')}</th><th>${chip('密使')}</th><th>${chip('蜃気楼')}</th><th>${chip('公安')}</th></tr></thead><tbody>
    ${teams.map(x=>`<tr><td>${x.tm}</td><td>${esc(x.s)}</td><td>${esc(x.b)}</td><td>${esc(x.te)}</td><td>${esc(x.k)}</td></tr>`).join('')}</tbody></table></div>
    <h3>このタームの順位と投票</h3><p class="sub">投票で当たった欄に ◯ を付けています。自分の役職の欄には自分の名前を書くルールだったので、そこは数えていません。</p>
    <div class="tw"><table><thead><tr><th class="num">順位</th><th>コードネーム</th><th>チーム</th><th>役職</th><th>内通者だと思った人</th><th>密使</th><th>蜃気楼</th><th class="num">点</th></tr></thead><tbody>
    ${L.map(s=>`<tr${s.rank===1?' class="first"':''}><td class="num">${s.rank}</td><td><b>${esc(s.name)}</b></td><td>${s.team}</td><td>${chip(s.role)}</td>
      <td>${esc(s.vote.s)||'<span class="sub">未回答</span>'}${hit(s,'s','内通者')?' ◯':''}</td><td>${esc(s.vote.b)}${hit(s,'b','密使')?' ◯':''}</td><td>${esc(s.vote.t)}${hit(s,'t','蜃気楼')?' ◯':''}</td><td class="num total">${s.pt}</td></tr>`).join('')}</tbody></table></div>`;
  });
  return h;
}

function gm(t){
  const T=D.terms[t-1];
  return `<h1>GM手帳　ターム${t}</h1>${floors('gm',t)}
  <p>当日、GMがスマホで見ながら進行に使った手帳です。時間順に、どこへ何を送ったかがそのまま残っています。名前はコードネームに、URLは伏せ字に置き換えています。</p>
  <ol class="tl">${T.steps.map(s=>{
    let body='';
    if(s.place)body+=`<div class="place">${esc(s.place)}<span class="pw">${esc(s.pw)}</span></div>`;
    if(s.note)body+=`<p class="sub" style="margin:6px 0 0">${esc(s.note)}</p>`;
    if(s.photo&&s.title.includes('答えの写真'))body+=`<div class="shot"><img src="${esc(s.photo)}" alt="答えの写真" loading="lazy"></div>`;
    if(s.kind==='reward')body+=`<details class="m"><summary>獲得の順番に送った20個</summary><ol class="clues">${T.rewards.map((r,i)=>`<li><span class="i">${i+1}</span><span><span class="k">${esc(r.kind)}</span>${esc(r.text)}</span></li>`).join('')}</ol></details>`;
    body+=(s.msgs||[]).map(m=>`<details class="m"><summary>${esc(m.label)}${m.tag&&m.tag!=='全員'?` <span class="sub">（${esc(m.tag)}）</span>`:''}</summary><pre>${esc(m.text.replace(/\{(\w+)\}/g,(a,k)=>{const f=(m.fields||[]).find(x=>x.key===k);return '【'+(f?f.label:k)+'】'}))}</pre></details>`).join('');
    return `<li><div class="when">${esc(s.time)}</div><div class="card"><div class="to">${esc(s.to)}</div><h3>${esc(s.title)}</h3>${body}</div></li>`}).join('')}</ol>`;
}

/* ---------- router ---------- */
function route(){
  const parts=(location.hash.replace(/^#\/?/,'')||'').split('/');
  const p=parts[0]||'home';const t=Math.min(3,Math.max(1,parseInt(parts[1])||1));
  const pages={home:()=>home(),rules:()=>rules(),missions:()=>missions(t),answers:()=>answers(t),results:()=>results(),gm:()=>gm(t)};
  const f=pages[p]||pages.home;
  $('#main').innerHTML=f();
  document.querySelectorAll('.nav a').forEach(a=>{if(a.dataset.p===(pages[p]?p:'home'))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  const titles={home:'',rules:'ルール',missions:'お題',answers:'答え',results:'結果',gm:'GM手帳'};
  document.title=(titles[p]?titles[p]+'｜':'')+'台場スパイゲーム 2026.10.04';
  return {p,t};
}
let cur={};
function go(){const prev=cur.p;cur=route();if(prev!==undefined){window.scrollTo(0,0);$('#main').focus({preventScroll:true})}}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  const t=cur.t;const a=b.dataset.act;
  if(a==='next')opened[t]=Math.min(20,(opened[t]||0)+1);
  if(a==='all')opened[t]=20;
  if(a==='reset'){opened[t]=0;opened['r'+t]=false}
  if(a==='reveal')opened['r'+t]=true;
  const y=window.scrollY;route();window.scrollTo(0,y);
  const nb=$('[data-act="next"]');if(a==='next'&&nb&&!nb.disabled)nb.focus();
});
window.addEventListener('hashchange',go);
fetch('data.json').then(r=>r.json()).then(d=>{D=d;go()}).catch(()=>{$('#main').innerHTML='<p>データを読み込めませんでした。ページを再読み込みしてください。</p>'});
})();
