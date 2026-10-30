#!/usr/bin/env bash
# Deploy Vox to Vercel. Run from the repo root:  bash deploy/vercel.sh
# Copies the settings from backend/.env to Vercel without printing them.
set -euo pipefail

vercel link --yes --project vox

for key in NEBIUS_API_KEY NEBIUS_BASE_URL MODEL_FAST MODEL_SMART MODEL_DEEP; do
  value=$(grep -E "^$key=" backend/.env | head -1 | cut -d= -f2- | tr -d '\r')
  if [ -n "$value" ]; then
    printf '%s' "$value" | vercel env add "$key" production --force
  fi
done

# Only /tmp is writable on Vercel. It is wiped whenever the function goes cold.
printf '%s' "/tmp/vox.db" | vercel env add VOX_DB production --force

vercel deploy --prod --yes
