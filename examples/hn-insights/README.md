# HN Insights

Summarize Hacker News top stories into structured daily insights.

## Run

From the repo root:

```bash
npm run build
npx tsx examples/hn-insights/run.ts
```

## Choose provider/model

```bash
npx tsx examples/hn-insights/run.ts google-antigravity claude-sonnet-4-5
```

## List models

```bash
pie --list-models --models-provider google-antigravity
```

## Auth

This example uses OAuth via `examples/_shared/oauth.ts` and stores credentials in `~/.pi/agent/auth.json`. If credentials are missing, it will prompt you to log in.
