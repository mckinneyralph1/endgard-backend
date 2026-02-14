#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <supabase_project_id> <supabase_publishable_key>"
  exit 1
fi

PROJECT_ID="$1"
PUBLISHABLE_KEY="$2"
SUPABASE_URL="https://${PROJECT_ID}.supabase.co"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

SAAS_ENV="${ROOT_DIR}/endgard-saas/.env"
ADMIN_ENV="${ROOT_DIR}/endgard-admin-portal/.env"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"

backup_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cp "$file" "${file}.bak.phase1.${TIMESTAMP}"
  fi
}

write_env() {
  local file="$1"
  cat > "$file" <<EOF
VITE_SUPABASE_PROJECT_ID="${PROJECT_ID}"
VITE_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY}"
VITE_SUPABASE_URL="${SUPABASE_URL}"
EOF
}

backup_file "$SAAS_ENV"
backup_file "$ADMIN_ENV"

write_env "$SAAS_ENV"
write_env "$ADMIN_ENV"

echo "Updated unified Supabase client env files:"
echo "- ${SAAS_ENV}"
echo "- ${ADMIN_ENV}"
echo "Backups were created with suffix .bak.phase1.${TIMESTAMP}"
