# warm-cache

This example compares **on-demand caching** with **warmCache pre-population** for an online batch.

## How it works

- **On-demand cache**: runs an online batch without pre-warming. The first item pays full LLM latency and the batch is slow.
- **warmCache**: runs `warmCache` offline first, then runs the same online batch where each item should be a cache hit. The online batch completes much faster.
- The script prints total, average, and time-to-first-result metrics to highlight the difference.

## Run

```bash
npm run build
npx tsx examples/warm-cache/run.ts
```

## Notes

- Uses a temporary file cache directory.
- Requires provider credentials (OAuth in these examples).
- This example complements `examples/caching`, which shows on-demand caching.
