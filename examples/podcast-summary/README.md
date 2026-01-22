# Podcast Summary Example

Summarize a podcast transcript with timestamps and extract highlights/quotes.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/podcast-summary/run.ts

# Or choose provider/model explicitly
npx tsx examples/podcast-summary/run.ts openai-codex gpt-5.2-codex
npx tsx examples/podcast-summary/run.ts google-antigravity gemini-3-flash
```

## Output

Prints a JSON summary with key takeaways, highlights, and quotes. Uses timestamps from `sample-transcript.txt`.
Progress is written to stderr.
