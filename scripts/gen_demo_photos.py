"""デモ（架空のシナリオ）で使う「作り物の写真」を、Codex の画像生成（ChatGPT のプランの利用枠）で作る。

    python3 scripts/gen_demo_photos.py            # まだ無いものだけ作る
    python3 scripts/gen_demo_photos.py t1-01 t2-05  # 指定したものだけ作り直す

- デモの見本写真・コンピューターの投稿・答えの写真に使う（本物の下見写真は本番だけ）
- 他社のキャラクター・ロゴ・実在の人物・実在の店名は描かせない（オリジナルのものに置き換える）
- 出来上がりは public/_secret/demo/t1-01.jpg など（長い辺1280px、付加情報なし）
必要なもの：Codex CLI（npm i -g @openai/codex）と codex login
"""
import os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/_secret/demo'
GEN = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex')) / 'generated_images'

STYLE = ('スマートフォンで撮ったような、自然な写真風の画像。日本の大きなショッピングモールの中（屋外のものは屋外）。'
         '既存のキャラクター・アニメ・ゲーム・ブランドのロゴ・実在の店名・実在の人物は描かない。看板の文字は読めない程度の架空のものにする。'
         '人物を描くときは、架空の20代の日本人の友人グループ（顔ははっきり描きすぎない）。横長 1536x1024。画像は1枚だけ生成し、ほかの作業はしない。')

# デモの架空シナリオ（scripts/demo_content.py）の場面。answerN はタームの答えの写真（人を入れない）
SCENES = {
 't1-01': '明るい吹き抜けの館内に立つ、巨大なイカの像（オリジナルデザイン）。足元の台座まで写っている。',
 't1-02': '館内の青い時計台。文字盤がはっきり読める。若者1人が時計を指さしている。',
 't1-03': '下の階が透けて見えるガラスの床の上に、若者1人が少しこわごわ立っている。',
 't1-04': '船の形をした木のベンチに、若者3人が並んで座っている。',
 't1-05': 'パン屋の前の巨大なクロワッサンの形の看板。若者1人がパンを食べるポーズ。',
 't1-06': '屋上の風見鶏と青空。',
 't2-01': '海辺のモールの屋外にある、白い灯台のオブジェ。上まで写っている。',
 't2-02': '3羽のカモメの像の横で、若者1人がカモメのポーズで並んでいる。',
 't2-03': '吹き抜けの天井から吊られた巨大なビーチボール。若者1人が見上げている。',
 't2-04': 'ハンモック売り場。ハンモックの前で若者1人が寝転ぶふりのポーズ（乗っていない）。',
 't2-05': '貝殻の形の噴水の前で、若者1人が手を合わせて祈るポーズ。',
 't2-06': '夕日が差す木のデッキに、3人分の人の影が並んで伸びている（人の顔は写らない）。',
 't3-01': '昭和風のレトロな駄菓子屋の店先で、若者1人が10円玉を見せるポーズ。',
 't3-02': '大きな招き猫の置物の横で、若者1人が招き猫と同じ手を挙げている。',
 't3-03': 'レトロな赤い郵便ポストに、若者1人が手紙を入れるポーズ。',
 't3-04': '縁日の射的の屋台で、若者1人がおもちゃの銃を構えるポーズ。',
 't3-05': '昔の黒電話の展示の前で、若者1人が受話器を耳に当てるポーズ。',
 't3-06': '「純喫茶」と光るネオン看板の喫茶店の入口（店名は架空）。',
 'answer1': '3階の吹き抜けの手すりのすぐ前から、1階の丸い噴水を斜めに見下ろした横長の写真。向かいに青い時計台、天井に丸い天窓、白いタイルの床、植木。人は写さない。',
 'answer2': '2階の屋外の木のデッキから、海と白い灯台のオブジェを入れた横長の写真。手前に青いパラソル、白い手すり、ヤシの木、遠くに橋。空が半分以上。人は写さない。',
 'answer3': '4階のレトロな商店街の通り。手前に赤い郵便ポスト、通りの奥に招き猫と赤い提灯、石畳風の床、夕焼け色の天井の縦長の写真。人は写さない。',
}

def gen(key):
    style = STYLE.replace('横長 1536x1024', '縦長 1024x1536') if key == 'answer3' else STYLE
    prompt = f"$imagegen\nPrimary request: 次の写真を1枚描く。\n描く内容: {SCENES[key]}\nConstraints:\n- {style}"
    work = tempfile.mkdtemp(prefix='spy_demo_')
    before = set(GEN.rglob('*.png')) if GEN.exists() else set()
    t0 = time.time()
    try:
        p = subprocess.run(['codex', 'exec', '-C', work, '-s', 'workspace-write', '--skip-git-repo-check', '--', prompt], capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        print('  10分で終わらなかったので飛ばします（あとで指定して作り直せます）', key); return False
    out = (p.stdout or '') + (p.stderr or '')
    if re.search(r'usage limit|rate limit|quota|limit reached', out, re.I): sys.exit('Codex の利用枠に達しました。時間をおいて、もう一度実行してください。')
    new = sorted([x for x in GEN.rglob('*.png') if x not in before and x.stat().st_mtime >= t0 - 2], key=lambda x: x.stat().st_mtime) if GEN.exists() else []
    if not new: print('  画像が見つかりませんでした', key, out[-300:]); return False
    im = Image.open(new[-1]).convert('RGB'); im.thumbnail((1280, 1280))
    im.save(OUT / f'{key}.jpg', 'JPEG', quality=82)   # 付加情報は残さない
    return True

if __name__ == '__main__':
    os.environ['PATH'] = f"{Path.home() / '.npm-global/bin'}:{os.environ.get('PATH', '')}"
    if not shutil.which('codex'): sys.exit('codex が見つかりません。 npm i -g @openai/codex のあと codex login をしてください。')
    OUT.mkdir(parents=True, exist_ok=True)
    keys = sys.argv[1:] or [k for k in SCENES if not (OUT / f'{k}.jpg').exists()]
    for i, k in enumerate(keys, 1):
        print(f'[{i}/{len(keys)}] {k}', flush=True)
        gen(k)
    # 写真の場所は scripts/demo_content.py が content.json に書き込んでいる（demo/t1-01.jpg、demo/answer1.jpg）
    print('できた枚数：', len(list(OUT.glob('*.jpg'))))
