# EndGard Backend (Unified)

This repository is the canonical backend for both EndGard SaaS and Admin Panel.

## Phase 1 Goal
Build a non-destructive backend foundation that allows both existing frontends to use one shared Supabase backend without UI/UX refactors and without breaking current endpoint contracts.

## Non-Negotiables
- No UI/UX refactor during migration.
- No endpoint contract changes without a compatibility layer.
- No destructive schema removal before the post-production stabilization window.

## What is included in Phase 1
- Canonical Supabase schema/functions from SaaS.
- Admin compatibility layer (schema + function contracts).
- Unified environment wiring script for both existing app repos.
- AI setup and completeness baseline documentation.

See `docs/phase-1/PHASE_1_DELIVERABLES.md` for exact file-by-file details.
