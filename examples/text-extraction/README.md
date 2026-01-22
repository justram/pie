# Text Extraction Example

This example runs a basic sentiment + keyword extraction using OAuth-backed providers.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/text-extraction/run.ts

# Or choose provider/model explicitly
npx tsx examples/text-extraction/run.ts openai-codex gpt-5.2-codex
npx tsx examples/text-extraction/run.ts google-antigravity gemini-3-flash
```

## Output

Prints a JSON object with sentiment, confidence, and keywords to stdout. Progress is written to stderr.
