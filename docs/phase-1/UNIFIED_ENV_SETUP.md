# Unified Environment Setup

## 1) Set backend env
Populate `endgard-backend/.env` from `endgard-backend/.env.example`.

## 2) Point both frontends to one Supabase project
From repo root:

```bash
./endgard-backend/scripts/apply-unified-supabase-env.sh <PROJECT_ID> <PUBLISHABLE_KEY>
```

This updates:
- `endgard-saas/.env`
- `endgard-admin-portal/.env`

and creates timestamped backups of the old env files.

## 3) Deploy backend to unified project
Deploy migrations/functions from `endgard-backend/supabase` to the unified Supabase project.

## 4) Validate
- SaaS auth + dashboard load
- Admin auth + user/account tabs
- Billing flows (`create-checkout`, `customer-portal`, `stripe-webhook`)
- AI entry points (workflow, certification agent, predictive risk, NL search)
