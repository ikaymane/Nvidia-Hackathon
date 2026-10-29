#!/usr/bin/env bash
# Deploy Vox to a free Hugging Face Space (Gradio SDK, no Docker needed).
#
#   bash deploy/huggingface.sh <hf-username> [space-name]
#   DRY_RUN=1 bash deploy/huggingface.sh <hf-username>    # build .hf-build/ only, no push
#
# What it does:
#  1. builds the React app here (the Space has no Node),
#  2. assembles a Space folder in .hf-build/: the backend, the built frontend, app.py,
#     requirements.txt, and a README with the YAML header Spaces need,
#  3. pushes that folder to the Space. Git asks for your Hugging Face username and an
#     access token (https://huggingface.co/settings/tokens, "write") as the password.
set -euo pipefail

USER_NAME="${1:?usage: bash deploy/huggingface.sh <hf-username> [space-name]}"
SPACE="${2:-vox}"
ROOT="$(git rev-parse --show-toplevel)"  # run it from anywhere inside the repo
OUT="$ROOT/.hf-build"

echo "1/3 Building the frontend…"
(cd "$ROOT/frontend" && npm run build --silent)

echo "2/3 Assembling the Space…"
rm -rf "$OUT"
mkdir -p "$OUT"
git -C "$ROOT" archive HEAD backend assets LICENSE | tar -x -C "$OUT"
rm -rf "$OUT/backend/tests" "$OUT/backend/evals.py"
mkdir -p "$OUT/frontend"
cp -r "$ROOT/frontend/dist" "$OUT/frontend/dist"
cp "$ROOT/deploy/hf_app.py" "$OUT/app.py"
cp "$ROOT/deploy/hf_requirements.txt" "$OUT/requirements.txt"
{
  cat <<'YAML'
---
title: Vox
emoji: 🎙️
colorFrom: green
colorTo: gray
sdk: gradio
app_file: app.py
python_version: "3.11"
pinned: false
license: mit
short_description: Voice-first personal assistant on NVIDIA Nemotron 3
---

YAML
  git -C "$ROOT" show HEAD:README.md
} > "$OUT/README.md"

if [ "${DRY_RUN:-}" = "1" ]; then
  echo "DRY_RUN: Space folder ready in $OUT (not pushed)."
  exit 0
fi

echo "3/3 Pushing to https://huggingface.co/spaces/$USER_NAME/$SPACE …"
cd "$OUT"
git init -q -b main
git add -A
git -c user.name="Vox deploy" -c user.email="deploy@vox.local" commit -q -m "Deploy Vox $(git -C "$ROOT" rev-parse --short HEAD)"
git push --force "https://huggingface.co/spaces/$USER_NAME/$SPACE" main

echo
echo "Done. Build log: https://huggingface.co/spaces/$USER_NAME/$SPACE"
echo "Your app:       https://$USER_NAME-$SPACE.hf.space"
