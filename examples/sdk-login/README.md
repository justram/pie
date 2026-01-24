# SDK OAuth Login Example

This example shows how SDK users can trigger OAuth login without invoking the CLI.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/sdk-login/run.ts

# Or choose a provider explicitly
npx tsx examples/sdk-login/run.ts openai-codex
npx tsx examples/sdk-login/run.ts google-antigravity
```

## Output

Prints a confirmation message after credentials are saved to `~/.pi/agent/auth.json`.
