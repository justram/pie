# Extraction Setup Example

This example writes a schema + template-based setup file, loads it with `loadExtractionSetup`, and runs an extraction.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/extraction-setup/run.ts

# Or choose provider/model explicitly
npx tsx examples/extraction-setup/run.ts openai-codex gpt-5.2
npx tsx examples/extraction-setup/run.ts google-antigravity gemini-3-flash
npx tsx examples/extraction-setup/run.ts anthropic claude-sonnet-4
```

## Output

- Writes `setup-schema.json` and `setup.md` next to the script.
- Prints the extracted JSON to stdout.

Progress is written to stderr.
