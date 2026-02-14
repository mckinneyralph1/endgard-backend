#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <source_label> <db_url> <output_dir>"
  echo "Example: $0 saas \"postgresql://...\" ./tmp/migration-20260214"
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump is required but not installed."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Error: psql is required but not installed."
  exit 1
fi

LABEL="$1"
DB_URL="$2"
OUT_DIR="$3"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SQL_DIR="${ROOT_DIR}/migration/sql"

mkdir -p "${OUT_DIR}"

DUMP_FILE="${OUT_DIR}/${LABEL}.public.data.sql"
INVENTORY_FILE="${OUT_DIR}/${LABEL}.inventory.txt"
COUNTS_FILE="${OUT_DIR}/${LABEL}.counts.txt"

pg_dump "${DB_URL}" \
  --data-only \
  --schema=public \
  --inserts \
  --column-inserts \
  --no-owner \
  --no-privileges \
  --file "${DUMP_FILE}"

psql "${DB_URL}" -At -f "${SQL_DIR}/10_source_inventory.sql" > "${COUNTS_FILE}"

{
  echo "label=${LABEL}"
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "dump_file=${DUMP_FILE}"
  echo "counts_file=${COUNTS_FILE}"
} > "${INVENTORY_FILE}"

echo "Export complete: ${DUMP_FILE}"
echo "Inventory complete: ${INVENTORY_FILE}"
