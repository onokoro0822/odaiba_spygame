#!/bin/sh
# 公開する。10/04 の記録（private/archive_site）を、推測しにくいパス（private/archive_path.txt）に写してから上げる
set -e
cd "$(dirname "$0")/.."
SLUG=$(cat ../private/archive_path.txt)
rm -rf public/kiroku-*
cp -R ../private/archive_site "public/$SLUG"
npx wrangler pages deploy public --project-name odaiba-spy --branch main
rm -rf "public/$SLUG"
