#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${ROOT}/app"

echo "→ npm install (app/)"
cd "${APP}"
npm install

ENV_FILE="${APP}/.env.local"
if [[ -f "${ENV_FILE}" ]]; then
  echo "→ .env.local sudah ada, tidak ditimpa"
  exit 0
fi

if [[ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" && -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  SITE="${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}"
  cat > "${ENV_FILE}" <<EOF
NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
NEXT_PUBLIC_SITE_URL=${SITE}
EOF
  echo "→ .env.local dibuat dari Codespaces secrets"
else
  cp "${APP}/.env.example" "${ENV_FILE}"
  echo ""
  echo "⚠️  Isi app/.env.local manual ATAU tambahkan GitHub Codespaces secrets:"
  echo "    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"
  echo "    (opsional) NEXT_PUBLIC_SITE_URL — default http://localhost:3000"
  echo "    Lalu jalankan: bash .devcontainer/post-create.sh"
  echo ""
fi
