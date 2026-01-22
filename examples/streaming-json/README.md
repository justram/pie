# streaming-json

Demonstrates the CLI-style partial JSON streaming behavior that uses `parseStreamingJson` under the hood.

## How it works

- Feeds synthetic token deltas into the JSON streamer used by the CLI `--stream` path.
- Emits JSONL records only when the partial JSON is valid enough to parse.
- Prints deltas to stderr and streamed JSON to stdout.

## Run

```bash
npm run build
npx tsx examples/streaming-json/run.ts
```

## Notes

- Output is JSONL on stdout. Use `| jq` to pretty-print if desired.
