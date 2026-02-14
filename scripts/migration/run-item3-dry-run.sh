#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Usage: $0 <target_db_url> <saas_public_dump.sql> <admin_staging_dump.sql>"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is required but not installed."
  exit 1
fi

TARGET_DB_URL="$1"
SAAS_DUMP="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
ADMIN_STAGING_DUMP="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_DIR="${ROOT_DIR}/migration/sql"

cat <<EOF | psql "${TARGET_DB_URL}" -v ON_ERROR_STOP=1
BEGIN;
\i ${SAAS_DUMP}
\i ${SQL_DIR}/20_prepare_admin_staging.sql
\i ${ADMIN_STAGING_DUMP}
\i ${SQL_DIR}/30_admin_dry_run_checks.sql
\i ${SQL_DIR}/40_merge_admin_core.sql
\i ${SQL_DIR}/50_post_import_validation.sql
ROLLBACK;
EOF

echo "Dry-run completed successfully (transaction rolled back)."
