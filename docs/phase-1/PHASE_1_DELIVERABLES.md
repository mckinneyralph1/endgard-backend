# Phase 1 Deliverables (Exact, File-by-File)

## Scope
Phase 1 establishes a shared backend with compatibility layers so both existing frontends can run unchanged from a UI/UX perspective.

## Ordered Deliverables
1. `supabase/**` (copied from SaaS)
- Canonical starting backend (all existing SaaS DB logic + edge functions).

2. `supabase/functions/stripe-webhook/index.ts`
- Added admin webhook function into unified backend.

3. `supabase/functions/sync-platform-accounts/index.ts`
- Added admin account sync function into unified backend.

4. `supabase/functions/create-checkout/index.ts`
- Unified checkout contract to tier-based mapping only:
- Required payload: `{ tier }`
- Stripe price mapping comes from backend env (`STRIPE_*_PRICE_ID`), so prices are adjusted centrally.

5. `supabase/functions/customer-portal/index.ts`
- Added compatibility for both apps' return routes with optional `returnPath` and referer-based fallback.

6. `supabase/migrations/20260214080000_phase1_admin_compat_non_destructive.sql`
- Non-destructive schema compatibility bridge for Admin expectations.
- No table/column removals.

7. `supabase/config.toml`
- Rebased to unified project placeholder and added admin function declarations.

8. `.env.example`
- Unified server-side environment template.

9. `scripts/apply-unified-supabase-env.sh`
- One command to point SaaS + Admin clients at the same Supabase project.

10. `docs/architecture/AI_SETUP.md`
- AI architecture/integration inventory.

11. `docs/phase-1/COMPLETENESS_BASELINE.md`
- Current known placeholders and wiring gaps baseline.

12. `docs/phase-1/UNIFIED_ENV_SETUP.md`
- Client and backend env setup steps.

13. `docs/phase-1/EXECUTION_LOG.md`
- Ordered record of what was executed in this phase.

## Guardrails Confirmed
- No UI/UX refactor performed.
- No endpoint contract removed; compatibility added.
- No destructive schema removal included.
