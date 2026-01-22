# validation-http

This example shows `validateUrl`, which validates extracted JSON via an HTTP endpoint.

## How it works

- pie runs schema validation first.
- It POSTs the extracted JSON to the URL.
- 2xx responses pass; 4xx/5xx responses fail and the response body becomes the validation error message.

The example spins up a local HTTP server and validates `score >= 0.7`.

## Run

```bash
npm run build
npx tsx examples/validation-http/run.ts
```
