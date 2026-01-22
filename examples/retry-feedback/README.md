# Retry + Feedback Example

This example demonstrates how pie feeds schema and validator errors back to the model and retries until the output passes validation.

It uses a **real provider/model**, so you will need valid credentials for the selected provider.

## Run

From the repo root:

```bash
npx tsx examples/retry-feedback/run.ts

# Or choose provider/model explicitly
npx tsx examples/retry-feedback/run.ts google-antigravity gemini-3-flash
npx tsx examples/retry-feedback/run.ts openai-codex gpt-5.2
```

## What it shows

- **Turn 1**: The prompt instructs the model to intentionally violate the schema (missing `labels`, `score` as a string).
- **Schema feedback**: pie sends the schema error back to the model as feedback.
- **Turn 2**: The model returns schema-valid JSON but fails the custom validator (`score >= 0.8`, `labels` includes `verified`).
- **Validator feedback**: pie sends the validation error back to the model and retries.
- **Turn 3**: The model returns a fully valid response and extraction completes.

### Where to look

- **stderr**: Progress events (`validation_error`, `turn_end`, etc.) and the feedback sent to the model.
- **stdout**: The final structured result.

### Notes

- The example relies on the model following instructions to intentionally fail on the first turn.
- If your provider/model ignores the instruction, increase `maxTurns` or adjust the prompt wording.
