"""public/archive/data.json から、ゲームで使う中身（src/content.json）を作る。
答えの写真は public/_secret/ にコピーする（関数からだけ読める場所）。"""
import json, re, shutil, os, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, 'public/archive/data.json')))
hari = sys.argv[1] if len(sys.argv) > 1 else None

def hm(s): h, m = s.split(':'); return int(h) * 60 + int(m)

ROLE_BY_TITLE = {'内通者': '内通者', '蜃気楼': '蜃気楼', '密使': '密使'}
terms = []
for T in d['terms']:
    t = T['t']
    a0 = hm(T['a0'])
    contacts = {}
    for s in T['steps']:
        m = re.match(r'(内通者|蜃気楼|密使)の接触 (\d)回目', s['title'])
        if not m: continue
        role, n = m.group(1), int(m.group(2))
        f, to = s['time'].split('〜')
        c = contacts.setdefault(role, {'pw': s['pw'], 'slots': []})
        c['slots'].append({'n': n, 'from': hm(f) - a0, 'to': hm(to) - a0, 'place': s['place']})
    terms.append({
        't': t, 'mall': T['mall'], 'floors': [str(i) for i in range(1, 8)],
        'answer': T['answer'], 'photo': f'term{t}.jpg', 'bep': T['bep'],
        'odai': [{'no': o['no'], 'title': o['title'], 'order': o['order'], 'cond': o['cond'],
                  'tags': [x for x in o['memo'].split('／') if x and x != '最初に公開']}
                 for o in d['odai'] if o['t'] == t],
        'rewards': T['rewards'],
        'checks': [{'no': c['no'], 'item': c['item'], 'bep': c['bep']} for c in d['check'] if c['t'] == t],
        'contacts': contacts,
    })

# 張り込みの「瞬間」の候補（当日の割り当てから、動作だけ取り出す）
actions = []
if hari:
    for term in json.load(open(hari))['H'].values():
        for lst in term.values():
            for _, a in lst:
                if a not in actions: actions.append(a)

out = {'title': '台場スパイゲーム', 'subtitle': 'お台場の3つのモールで遊ぶスパイゲーム',
       'durations': {'action': 60, 'meeting': 10, 'vote': 5}, 'openCount': 3,
       'harikomiPerTeam': 5, 'harikomiMax': 3, 'sabotageMax': 4,
       'harikomiActions': actions, 'terms': terms}
json.dump(out, open(os.path.join(ROOT, 'src/content.json'), 'w'), ensure_ascii=False, indent=1)
os.makedirs(os.path.join(ROOT, 'public/_secret'), exist_ok=True)
for t in (1, 2, 3):
    shutil.copy(os.path.join(ROOT, f'public/archive/img/term{t}.jpg'), os.path.join(ROOT, f'public/_secret/term{t}.jpg'))
print('terms', len(terms), 'actions', len(actions), {r: c['slots'] for r, c in terms[0]['contacts'].items()})
