#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <target_db_url>"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is required but not installed."
  exit 1
fi

TARGET_DB_URL="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_DIR="${ROOT_DIR}/migration/sql"

psql "${TARGET_DB_URL}" -v ON_ERROR_STOP=1 -f "${SQL_DIR}/50_post_import_validation.sql"
