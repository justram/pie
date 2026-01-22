# CRM Search Example

Generate structured CRM search queries from a natural language request.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/crm-search/run.ts

# Or choose provider/model explicitly
npx tsx examples/crm-search/run.ts google-antigravity gemini-3-flash
npx tsx examples/crm-search/run.ts openai-codex gpt-5.2-codex
```

## Output

Emits JSON with a `queries` array containing the CRM search criteria. Progress is written to stderr.
