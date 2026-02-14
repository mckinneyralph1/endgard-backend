# AI Setup (Current)

## How AI is wired
- Frontend invokes Supabase Edge Functions via `supabase.functions.invoke(...)`.
- Edge Functions call OpenAI Chat Completions endpoint:
- `https://api.openai.com/v1/chat/completions`
- Auth is via `OPENAI_API_KEY` in function env.

## Models observed in current stack
- `gpt-4o-mini`
- `gpt-4o`
- `gpt-4o-mini`

## Core AI-oriented functions
- `workflow-orchestrator`
- `workflow-document-processor`
- `workflow-hazard-extractor`
- `workflow-requirement-extractor`
- `workflow-test-generator`
- `workflow-conformance-generator`
- `workflow-traceability-engine`
- `certification-agent`
- `predictive-risk`
- `nl-search`
- `gap-analysis`
- `generate-checklist-items`
- `generate-report`
- `recommend-controls`
- `recommend-test-cases`
- `recommend-requirement-links`
- `validate-compliance`

## Note
Provider is now centralized on OpenAI and no Lovable gateway dependency remains in active backend functions.
