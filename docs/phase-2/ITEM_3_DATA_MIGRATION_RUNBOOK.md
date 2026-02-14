# Item 3: Data Migration Runbook
## Current Decision (Dev Stage)
Item 3 is intentionally skipped for the current development stage because legacy data migration is not required yet.

The scripts and SQL in this document are retained for when migration becomes necessary (staging/prod cutover).

## Objective
Export data from both current source databases, transform where schemas differ, import into unified target DB, and validate counts/integrity/invariants.

## Inputs
- `SOURCE_SAAS_DB_URL` (old SaaS database)
- `SOURCE_ADMIN_DB_URL` (old Admin database)
- `TARGET_DB_URL` (unified backend database)

## Prerequisites
- `pg_dump` and `psql` installed locally.
- Target DB already has consolidated schema/migrations applied.
- Migration executed first in staging clone of target.
- Write freeze window active on both old source systems during final migration.

## Important
If DB passwords contain reserved URL characters (e.g. `#`, `@`, `/`, `?`), URL-encode them in connection strings.

## Artifacts
- Source inventory SQL: `migration/sql/10_source_inventory.sql`
- Admin staging schema prep: `migration/sql/20_prepare_admin_staging.sql`
- Dry-run checks: `migration/sql/30_admin_dry_run_checks.sql`
- Merge transform SQL: `migration/sql/40_merge_admin_core.sql`
- Post-import validations: `migration/sql/50_post_import_validation.sql`
- Export script: `scripts/migration/export-source-data.sh`
- Admin dump transform script: `scripts/migration/prepare-admin-staging-dump.sh`
- Dry-run script: `scripts/migration/run-item3-dry-run.sh`
- Commit import script: `scripts/migration/run-item3-import.sh`
- Validation script: `scripts/migration/run-item3-validation.sh`

## Step-by-step
1. Export SaaS source data
```bash
./endgard-backend/scripts/migration/export-source-data.sh \
  saas "$SOURCE_SAAS_DB_URL" ./tmp/migration-$(date +%Y%m%d)
```

2. Export Admin source data
```bash
./endgard-backend/scripts/migration/export-source-data.sh \
  admin "$SOURCE_ADMIN_DB_URL" ./tmp/migration-$(date +%Y%m%d)
```

3. Transform admin dump to staging schema
```bash
./endgard-backend/scripts/migration/prepare-admin-staging-dump.sh \
  ./tmp/migration-YYYYMMDD/admin.public.data.sql \
  ./tmp/migration-YYYYMMDD/admin.staging.data.sql
```

4. Run full dry-run (transaction rollback)
```bash
./endgard-backend/scripts/migration/run-item3-dry-run.sh \
  "$TARGET_DB_URL" \
  ./tmp/migration-YYYYMMDD/saas.public.data.sql \
  ./tmp/migration-YYYYMMDD/admin.staging.data.sql
```

5. Review dry-run output and fix any reported collisions/integrity failures.

6. Execute committed migration (staging first, then production window)
```bash
./endgard-backend/scripts/migration/run-item3-import.sh \
  "$TARGET_DB_URL" \
  ./tmp/migration-YYYYMMDD/saas.public.data.sql \
  ./tmp/migration-YYYYMMDD/admin.staging.data.sql
```

7. Run post-import validation
```bash
./endgard-backend/scripts/migration/run-item3-validation.sh "$TARGET_DB_URL"
```

## Validation acceptance criteria
- No orphan checks in `50_post_import_validation.sql` have failures > 0.
- No business invariant checks have failures > 0.
- Critical row counts align with expected source totals.

## Notes on migration strategy
- SaaS dump is loaded as base data into `public`.
- Admin dump is loaded into `migration_admin` staging schema.
- Admin data is merged into `public` via controlled upsert logic in `40_merge_admin_core.sql`.
- This avoids destructive changes and preserves compatibility constraints.
