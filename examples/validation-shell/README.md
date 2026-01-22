# validation-shell

This example shows `validateCommand`, which runs a shell command to validate the extracted JSON.

## How it works

- pie runs schema validation first.
- It executes `sh -c <command>` and pipes the extracted JSON to stdin.
- Exit code 0 = pass, non-zero = fail (stderr becomes the validation error message).

This example uses a bash script (`validate-score.sh`) that checks `score >= 0.5`.

## Run

```bash
npm run build
npx tsx examples/validation-shell/run.ts
```

## Notes

- Requires `bash` and `jq` in PATH.
- Any command is valid (e.g., `python3 ./validate.py`).
