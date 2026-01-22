# Caching Example

This example demonstrates file-backed caching for pie. It runs the same extraction twice:

- First run should be a cache miss and call the LLM.
- Second run should be a cache hit and return immediately.

## Run

From the repo root:

```bash
npx tsx examples/caching/run.ts

# Or choose provider/model explicitly
npx tsx examples/caching/run.ts google-antigravity gemini-3-flash
npx tsx examples/caching/run.ts openai-codex gpt-5.2-codex
```

Cache files are written to:

```
examples/caching/.cache
```

## How the demo works

- **File-backed cache**: Uses `createFileCache({ directory })` to persist results under `examples/caching/.cache`.
- **TTL enforcement**: Sets `cache: { store, ttl: 5 * 60 * 1000 }` so entries expire after 5 minutes.
- **Deterministic keys**: `extract` builds a cache key from input, schema, prompt, model, and validators.
- **Cache events**: Logs `cache_miss`, `cache_hit`, and `cache_set` to stderr so you can see cache behavior.
- **Timing comparison**: Measures each run’s duration and prints “Time saved” to show cache benefit.

## Cache vs warmCache

- **`cache`** is on-demand: each extraction checks the cache and either returns a hit or calls the LLM and then stores the result.
- **`warmCache`** is pre-population: it runs extractions ahead of time for a list of inputs, storing results so later calls can hit the cache immediately.

### When to use which

- Use **`cache`** for interactive or ad-hoc workloads where inputs arrive over time.
- Use **`warmCache`** for batch jobs or known inputs where you want to front-load cost/latency.
- You can combine both: warm the cache for known inputs, then rely on `cache` for ongoing usage.

### Expected output behavior

- **First run**: `cache_miss` → LLM call → `cache_set`, slower.
- **Second run**: `cache_hit`, no LLM call, faster.
