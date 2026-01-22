# validation-retry

This example shows a validation error logged first, followed by a successful retry.

## How it works

- The validator script (`validate-first-fail.sh`) intentionally fails once.
- pie surfaces the validation error in the event stream and retries.
- The second attempt passes and completes extraction.

## Run

```bash
npm run build
npx tsx examples/validation-retry/run.ts
```

## Notes

- Requires `bash`.
- The validator uses a sentinel file to fail exactly once.
