# Vision Example (Image Extraction)

This example mirrors the style of `instructor/examples/vision/run.py`, but uses `pie`.

It generates a simple PNG image containing a single colored circle, attaches it to the LLM request, and extracts:
- the circle's approximate center coordinates (`x`, `y`)
- the circle color (`red|green|blue|black`)

## Run

From the repo root:

```bash
# Defaults: google-antigravity + gemini-3-flash
npx tsx examples/vision-circle/run.ts

# Or choose provider/model explicitly
npx tsx examples/vision-circle/run.ts google-antigravity gemini-3-flash
npx tsx examples/vision-circle/run.ts openai-codex gpt-5.2-codex
```

If OAuth credentials are missing, the script will start an interactive login flow and persist credentials to:

- `~/.pi/agent/auth.json`

## Notes

- `pie` is intentionally I/O-free. This example reads/writes an image file using Node's `fs` module, then passes the image as base64 (`ImageContent`) to `pie`.
- The script uses a small, dependency-free PNG encoder to keep the example self-contained.
