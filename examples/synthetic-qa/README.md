# Synthetic Q&A Example

This example mirrors `instructor/examples/synthetic-data/run.py`, but uses `pie`.

It uses a few-shot prompt to generate new Q&A pairs similar to the provided examples.

## Run

From the repo root:

```bash
# Defaults: google-antigravity + gemini-3-flash
npx tsx examples/synthetic-qa/run.ts

# Or choose provider/model explicitly
npx tsx examples/synthetic-qa/run.ts google-antigravity gemini-3-flash
npx tsx examples/synthetic-qa/run.ts openai-codex gpt-5.2-codex
```

If OAuth credentials are missing, the script will start an interactive login flow and persist credentials to:

- `~/.pi/agent/auth.json`
