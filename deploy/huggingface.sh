#!/usr/bin/env bash
# Push the current main branch to a Hugging Face Docker Space.
#
#   bash deploy/huggingface.sh <hf-username> [space-name]
#
# A Space needs a little YAML header at the top of its README. We don't want that header
# on GitHub, so this script copies the repo to a temp folder, adds the header there, and
# pushes that copy. Git will ask for your Hugging Face username and an access token
# (https://huggingface.co/settings/tokens, "write" permission) as the password.
set -euo pipefail

USER_NAME="${1:?usage: bash deploy/huggingface.sh <hf-username> [space-name]}"
SPACE="${2:-vox}"
ROOT="$(git rev-parse --show-toplevel)"  # run it from anywhere inside the repo
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$ROOT" archive HEAD | tar -x -C "$TMP"

{
  cat <<'YAML'
---
title: Vox
emoji: 🎙️
colorFrom: green
colorTo: gray
sdk: docker
app_port: 8000
pinned: false
license: mit
short_description: Voice-first personal assistant on NVIDIA Nemotron 3
---

YAML
  cat "$TMP/README.md"
} > "$TMP/README.hf.md"
mv "$TMP/README.hf.md" "$TMP/README.md"

cd "$TMP"
git init -q -b main
git add -A
git -c user.name="Vox deploy" -c user.email="deploy@vox.local" commit -q -m "Deploy Vox from GitHub $(git -C "$ROOT" rev-parse --short HEAD)"
git push --force "https://huggingface.co/spaces/$USER_NAME/$SPACE" main

echo
echo "Pushed. Watch the build at https://huggingface.co/spaces/$USER_NAME/$SPACE"
echo "Your app: https://$USER_NAME-$SPACE.hf.space"
