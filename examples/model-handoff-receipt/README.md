# Model handoff: vision (Gemini) → reasoning (Codex)

This example demonstrates **cross-provider model handoff** inside a single `pie` extraction loop. The prompt/schema live in `setup.md` and the config uses a small shared router helper:

- **Turn 1** uses a vision-capable model (default: `google-antigravity/gemini-3-flash`) to read a synthetic receipt image.
- **Turns 2+** switch to a stronger reasoning model (default: `openai-codex/gpt-5.2`) to fix arithmetic / logic issues based on validator feedback.

The extraction includes a strict validator that enforces:

- `lineItems[i].total == quantity * unitPrice`
- `subtotal == sum(lineItems.total)`
- `total == subtotal + tax`

If any invariant fails, `pie` feeds the validation error back to the model and retries.

## Run

### Scripted (TypeScript)

From repo root:

```bash
npx tsx examples/model-handoff-receipt/run.ts
```

Optional explicit models:

```bash
# visionProvider visionModel reasoningProvider reasoningModel
npx tsx examples/model-handoff-receipt/run.ts google-antigravity gemini-3-flash openai-codex gpt-5.2
```

### CLI (config module)

The config is minimal and only wires the model router/validator; prompt and schema are loaded from `setup.md`.

```bash
pie --config examples/model-handoff-receipt/cli-config.mjs \
  -a examples/model-handoff-receipt/receipt.png \
  --verbose
```

Override models via environment variables:

```bash
VISION_MODEL=google-antigravity/gemini-3-flash \
REASONING_MODEL=openai-codex/gpt-5.2 \
  pie --config examples/model-handoff-receipt/cli-config.mjs \
  -a examples/model-handoff-receipt/receipt.png
```

Force a second turn to demonstrate handoff:

```bash
FORCE_HANDOFF=1 \
  pie --config examples/model-handoff-receipt/cli-config.mjs \
  -a examples/model-handoff-receipt/receipt.png \
  --verbose --stream
```

This example uses OAuth for `google-antigravity` and `openai-codex` (see `examples/_shared/oauth.ts`).

## Output

- JSON result on stdout
- progress / model routing logs on stderr
- a generated (intentionally noisy/rotated/stamped) receipt image written to `examples/model-handoff-receipt/receipt.png`
