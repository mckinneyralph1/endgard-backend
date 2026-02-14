#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <admin_public_dump.sql> <output_staging_dump.sql>"
  exit 1
fi

SRC_DUMP="$1"
OUT_DUMP="$2"

sed -E 's/INSERT INTO public\./INSERT INTO migration_admin./g' "${SRC_DUMP}" > "${OUT_DUMP}"

echo "Prepared staging dump: ${OUT_DUMP}"
