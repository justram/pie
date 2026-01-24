# pie

Structured extraction library and CLI built on `@mariozechner/pi-ai`.

- Mini agent loop: think → respond → validate → retry
- Schema-first with TypeBox + AJV
- Layered validation (schema, sync/async functions, shell, HTTP)
- Streaming events for observability
- Unix-friendly CLI
- Optional response caching

## Installation

```bash
npm install @justram/pie
```

## Getting Started

### Pick a model

`pie` uses the provider/model registry from `@mariozechner/pi-ai`. In the CLI, pass `--model provider/model`:

```bash
cat input.txt | pie \
	-s schema.json \
	-p "Extract fields" \
	--model anthropic/claude-sonnet-4-5
```

List available models (with optional filters):

```bash
pie --list-models --models-provider google-antigravity
pie --list-models --models-provider google-antigravity --models-filter gemini
```

### Authentication (API keys and OAuth)

`pie` does not require Pi to be installed. It uses the OAuth helpers from `@mariozechner/pi-ai` and stores credentials in `~/.pi/agent/auth.json` (created automatically on first login).

Credential resolution order:

1. `~/.pi/agent/auth.json` (API keys or OAuth tokens)
2. Environment variables (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`)
3. OAuth login (only for supported providers)

#### OAuth login

Run `--login` to authenticate with an OAuth-capable provider. The CLI prints a URL and prompts you to complete login in your browser.

```bash
pie --login openai-codex
```

#### SDK login (Node-only)

SDK users can trigger the same OAuth flow programmatically (uses Node prompts and writes to
`~/.pi/agent/auth.json`):

```ts
import { loginWithOAuthProvider } from "@justram/pie";

await loginWithOAuthProvider("openai-codex", process.stderr);
```

If you only need an API key and want auto-refresh, call `resolveApiKeyForProvider(provider, process.stderr)`.
These helpers are Node-only and are not intended for browser environments.

Supported OAuth providers:
- `anthropic`
- `github-copilot`
- `google-gemini-cli`
- `google-antigravity`
- `openai-codex`

If you skip this step, `pie` will still prompt for OAuth the first time you run a command that requires it.

```bash
cat input.txt | pie \
	-s schema.json \
	-p "Extract fields" \
	--model github-copilot/gpt-4o
```

#### API keys (recommended for examples)

Use environment variables:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Or add API keys to `~/.pi/agent/auth.json`:

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai": { "type": "api_key", "key": "sk-..." }
}
```

Auth file entries take precedence over environment variables. To switch from OAuth to API keys, remove the OAuth entry for that provider and add an `api_key` entry.

#### Already using Pi?

`pie` shares the same auth store as Pi: `~/.pi/agent/auth.json`. If you have already run `/login` in Pi, `pie` will reuse those credentials automatically. You can also add API keys to the same file and both tools will pick them up.

#### Resetting credentials

Edit or delete `~/.pi/agent/auth.json` to remove a provider and force re-login.

## SDK Usage

```ts
import { extractSync, getModel, Type } from "@justram/pie";

const schema = Type.Object({
	sentiment: Type.Union([
		Type.Literal("positive"),
		Type.Literal("negative"),
		Type.Literal("neutral"),
	]),
	confidence: Type.Number({ minimum: 0, maximum: 1 }),
});

const model = getModel("anthropic", "claude-sonnet-4-5");

const data = await extractSync("I love this product!", {
	schema,
	prompt: "Classify the sentiment.",
	model,
});

console.log(data);
```

### Streaming events

```ts
import { extract } from "@justram/pie";

const stream = extract("Example text", {
	schema,
	prompt: "Extract fields.",
	model: getModel("openai", "gpt-4o"),
});

for await (const event of stream) {
	if (event.type === "validation_error") {
		console.error(event.layer, event.error);
	}
}

const result = await stream.result();
```

### Caching

```ts
import { createFileCache, warmCache } from "@justram/pie/cache";
import { getModel } from "@justram/pie";

const model = getModel("anthropic", "claude-sonnet-4-5");
const store = createFileCache({ directory: "./cache" });

await warmCache(["doc1", "doc2"], {
	schema,
	prompt: "Extract fields.",
	model,
	cache: { store },
});
```

### Validation examples

#### Shell validator

```ts
const data = await extractSync(input, {
	schema,
	prompt: "Extract fields.",
	model,
	validateCommand: "jq -e '.score > 0.5'",
});
```

```bash
cat input.txt | pie -s schema.json -p "Extract" \
	--validate "jq -e '.score > 0.5'"
```

#### HTTP validator

```ts
const data = await extractSync(input, {
	schema,
	prompt: "Extract fields.",
	model,
	validateUrl: "https://api.example.com/validate",
});
```

```bash
cat input.txt | pie -s schema.json -p "Extract" \
	--validate-url "https://api.example.com/validate"
```

## CLI Usage

```bash
pie --help

# Basic extraction
cat input.txt | pie \
	-s schema.json \
	-p "Extract fields" \
	--model anthropic/claude-sonnet-4-5

# Stream partial JSON to stderr
cat input.txt | pie -s schema.json -p "Extract" --stream 2>progress.jsonl
```

### CLI Requirements

- A configured model credential (see [Authentication](#authentication-api-keys-and-oauth)).
- A JSON Schema (`--schema`) and prompt (`--prompt`/`--prompt-file`) unless you use `--config` or `--recipe`.

## Recipes

Recipes live in `~/.pie/recipes` or `./.pie/recipes` and allow reusable setups.

```bash
pie --list-recipes
pie --recipe support-triage --input ticket.txt
```

## Public API Surface

- The package root (`@justram/pie`) exposes the SDK surface from `src/index.ts` (extract, models, recipes, cache, errors, types).
- Cache helpers are also available via the `@justram/pie/cache` subpath.

### CLI entry flow (contributors)

- `src/cli.ts` is the executable entry (shebang) and delegates to `src/main.ts`.
- `src/cli/index.ts` re-exports `runCli` for tests and internal callers.

## Development

```bash
npm run build
npm run test
```

## License

MIT
