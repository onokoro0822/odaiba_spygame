// シナリオの点検。編集画面から届いたものを、ゲームで使える形にそろえる
const ROLES = ['内通者', '密使', '蜃気楼'];
const KINDS = ['手掛かり', '割符①', '割符②', '割符③', '割符④'];
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

export function cleanScenario(d, base) {
  const bad = [];
  if (!d || !Array.isArray(d.terms) || d.terms.length < 1 || d.terms.length > 5) throw new Error('タームは1〜5個にしてください');
  const out = {
    ...base, title: str(d.title, 60) || base.title, subtitle: str(d.subtitle, 120),
    harikomiActions: (d.harikomiActions || []).map(x => str(x, 60)).filter(Boolean),
    terms: d.terms.map((T, i) => {
      const t = i + 1, where = `ターム${t}`;
      const odai = (T.odai || []).map((o, j) => ({ no: j + 1, title: str(o.title, 60) || '調査写真の撮影', order: str(o.order), cond: str(o.cond, 500), tags: (o.tags || []).map(x => str(x, 30)).filter(Boolean), ...(o.sample ? { sample: str(o.sample, 80) } : {}), ...(o.demo ? { demo: str(o.demo, 80) } : {}) }));
      if (odai.length < (base.openCount || 3)) bad.push(`${where}：お題が${odai.length}個です（${base.openCount || 3}個以上）`);
      odai.forEach(o => { if (!o.order) bad.push(`${where}：お題${o.no}の指令が空です`); });
      const rewards = (T.rewards || []).map((r, j) => ({ id: `T${t}-${j + 1}`, kind: KINDS.includes(r.kind) ? r.kind : '手掛かり', text: str(r.text, 500) })).filter(r => r.text);
      const checks = (T.checks || []).map((c, j) => ({ no: j + 1, item: str(c.item, 120), bep: !!c.bep })).filter(c => c.item).map((c, j) => ({ ...c, no: j + 1 }));
      if (!checks.length) bad.push(`${where}：採点の項目がありません`);
      const contacts = {};
      for (const r of ROLES) {
        const c = T.contacts?.[r];
        if (!c) continue;
        const slots = (c.slots || []).map((x, j) => ({ n: j + 1, from: Math.round(Number(x.from)), to: Math.round(Number(x.to)), place: str(x.place, 120) }));
        slots.forEach(x => { if (!(x.from >= 0 && x.to > x.from && x.to <= 60)) bad.push(`${where}：${r}の${x.n}回目の時間（開始の${x.from}〜${x.to}分後）がおかしいです`); if (!x.place) bad.push(`${where}：${r}の${x.n}回目の場所が空です`); });
        contacts[r] = { pw: str(c.pw, 20), slots };
        if (!contacts[r].pw) bad.push(`${where}：${r}の合言葉が空です`);
      }
      const floors = String(Array.isArray(T.floors) ? T.floors.join(',') : T.floors || '').split(/[,、\s]+/).map(x => x.trim()).filter(Boolean);
      return { t, mall: str(T.mall, 60) || where, floors: floors.length ? floors : ['1'], answer: str(T.answer, 500), photo: str(T.photo, 120) || base.terms[i]?.photo || `term${t}.jpg`,
        bep: checks.filter(c => c.bep).map(c => c.item), odai, rewards, checks, contacts };
    }),
  };
  if (bad.length) { const e = new Error(bad.slice(0, 8).join('\n') + (bad.length > 8 ? `\nほか${bad.length - 8}件` : '')); e.list = bad; throw e; }
  return out;
}
