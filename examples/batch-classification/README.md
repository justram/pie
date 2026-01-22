# Batch Classification Example

This example mirrors `instructor/examples/batch-classification/run.py`, but uses `pie` with bounded concurrency.

It runs one extraction per question and prints each result as a JSON line, so the output can be piped or redirected
into other tools.

## Run

From the repo root:

```bash
# Defaults: google-antigravity + gemini-3-flash
npx tsx examples/batch-classification/run.ts

# Or choose provider/model explicitly
npx tsx examples/batch-classification/run.ts google-antigravity gemini-3-flash
npx tsx examples/batch-classification/run.ts openai-codex gpt-5.2-codex

# Optional third arg: concurrency
npx tsx examples/batch-classification/run.ts google-antigravity gemini-3-flash 5
```

## Output

Each line is a JSON object with the original question and its classifications. Redirect stdout to save results:

```bash
npx tsx examples/batch-classification/run.ts > classifications.jsonl
```

Progress updates are written to stderr.
