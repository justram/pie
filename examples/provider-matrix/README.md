# Provider Matrix Example

Run a small matrix of providers/models and emit a JSON line per run, including usage and errors.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/provider-matrix/run.ts
```

## Output

Each line is a JSON object with provider, modelId, status, and usage data when available. Redirect stdout to save results:

```bash
npx tsx examples/provider-matrix/run.ts > provider-matrix.jsonl
```

Progress is written to stderr.
