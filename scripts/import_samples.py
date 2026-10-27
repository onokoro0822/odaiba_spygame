"""下見写真（お題の見本）を取り込む。

    python3 scripts/import_samples.py <下見写真のフォルダか zip> [--blur blur.json]

- scripts/sample_photos.json の対応表（お題 → IMG_xxxx）で写真を探す
- 長い辺を1280pxに縮め、向きを直してから保存し直す（位置情報などの付加情報は残らない）
- blur.json に {"t1-01": [[x0, y0, x1, y1], ...]} の形で書いた範囲をぼかす（座標は縮めたあとの写真のピクセル）
- public/_secret/sample/t1-01.jpg などに置き、src/content.json の odai に "sample" を書き込む
- 確認用に、縮小した一覧を private/shitami/review/ に作る（人が写っていないか見るため）
"""
import json, os, sys, zipfile, tempfile
from PIL import Image, ImageOps, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1]
blur = {}
if '--blur' in sys.argv:
    blur = json.load(open(sys.argv[sys.argv.index('--blur') + 1]))

if src.endswith('.zip'):
    tmp = tempfile.mkdtemp()
    zipfile.ZipFile(src).extractall(tmp)
    src = tmp
files = {}
for d, _, fs in os.walk(src):
    for f in fs:
        stem, ext = os.path.splitext(f)
        if ext.lower() in ('.jpg', '.jpeg', '.png', '.heic'):
            files[stem.upper()] = os.path.join(d, f)

mapping = json.load(open(os.path.join(ROOT, 'scripts/sample_photos.json')))
content_path = os.path.join(os.path.dirname(ROOT), 'private/content_1004.json')  # 本番用のシナリオ（公開しない）
C = json.load(open(content_path))
out_dir = os.path.join(ROOT, 'public/_secret/sample')
review = os.path.join(os.path.dirname(ROOT), 'private/shitami/review')
os.makedirs(out_dir, exist_ok=True)
os.makedirs(review, exist_ok=True)
found = missing = 0
for T in C['terms']:
    names = mapping.get(str(T['t']), [])
    for o in T['odai']:
        name = names[o['no'] - 1] if o['no'] - 1 < len(names) else None
        key = f"t{T['t']}-{o['no']:02d}"
        path = files.get((name or '').upper())
        if not path:
            o.pop('sample', None)
            if name: missing += 1; print('見つからない', key, name)
            continue
        im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
        im.thumbnail((1280, 1280))
        for box in blur.get(key, []):
            region = im.crop(tuple(box)).filter(ImageFilter.GaussianBlur(max(8, (box[2] - box[0]) // 8)))
            im.paste(region, tuple(box[:2]))
        im.save(os.path.join(out_dir, key + '.jpg'), 'JPEG', quality=80)  # exif を渡さないので付加情報は消える
        sm = im.copy(); sm.thumbnail((640, 640)); sm.save(os.path.join(review, key + '.jpg'), 'JPEG', quality=70)
        o['sample'] = key + '.jpg'
        found += 1
json.dump(C, open(content_path, 'w'), ensure_ascii=False, indent=1)
print(f'取り込み {found}枚、見つからない {missing}枚')
