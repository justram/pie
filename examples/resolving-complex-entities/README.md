# Resolving Complex Entities Example

Extract entities with dependencies and optionally render a Graphviz diagram.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/resolving-complex-entities/run.ts

# Choose provider/model
npx tsx examples/resolving-complex-entities/run.ts openai-codex gpt-5.2-codex
npx tsx examples/resolving-complex-entities/run.ts google-antigravity gemini-3-flash
```

## Render Graphviz

Requires `dot` (Graphviz) in your PATH.

```bash
npx tsx examples/resolving-complex-entities/run.ts --render entity.png
```

## Output

Prints JSON with `entities`, `graphviz` (dot source), and `renderPath` when rendering. Progress is written to stderr.
