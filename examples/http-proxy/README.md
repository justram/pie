# http-proxy

This example demonstrates HTTP proxy environment variable support for API requests in pi-ai.

It starts a local HTTP proxy (with HTTPS tunneling) and sends real OAuth-backed API requests through it.
The scripts print the proxy request log so you can confirm traffic is routed correctly.
If you are not logged in yet, the scripts will trigger the OAuth flow and store credentials in
`~/.pi/agent/auth.json` via `examples/_shared/oauth.ts`.

## Run (SDK)

```bash
npm run build
npx tsx examples/http-proxy/run.ts
```

Pick a provider/model:

```bash
npx tsx examples/http-proxy/run.ts openai-codex gpt-5.2-codex
npx tsx examples/http-proxy/run.ts google-antigravity gemini-3-flash
```

## Run (CLI)

```bash
npm run build
npx tsx examples/http-proxy/run-cli.ts
```

Pick a provider/model:

```bash
npx tsx examples/http-proxy/run-cli.ts openai-codex gpt-5.2-codex
npx tsx examples/http-proxy/run-cli.ts google-antigravity gemini-3-flash
```

The CLI example uses `examples/http-proxy/cli-config.mjs` and injects OAuth API keys via
`PROXY_OAUTH_API_KEY`.
