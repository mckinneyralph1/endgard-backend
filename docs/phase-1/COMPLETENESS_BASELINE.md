# Completeness Baseline (Start of Backend Unification)

## Confirmed placeholders / incomplete wiring
- Stripe price configuration is now backend/env-driven by tier mapping in `create-checkout`; ensure all `STRIPE_*_PRICE_ID` values are set in backend env.

- Admin HTML metadata still has TODO tags:
- `endgard-admin-portal/index.html`

- `sync-platform-accounts` function exists but has no active frontend invocation found.

- Standards/custom library in SaaS has local in-memory behavior in parts of the stack and needs persistence hardening.

## Compatibility risks addressed in Phase 1
- Profile schema mismatch (`profiles.id` vs `profiles.user_id`) handled by non-destructive compatibility migration.
- Billing contract unified to tier-only mapping in backend + admin caller.

## Deferred to later phases
- Security hardening pass for JWT verification and role checks on high-privilege functions.
- Cleanup of hardcoded industry UUID usage in SaaS.
- Deep wiring audit for every admin action path in production-like data.
