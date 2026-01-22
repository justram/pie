# Examples Guide

Each example folder includes a `README.md` with setup, run commands, and expected output. Run examples from the repo root with `npm run build` first.

## 1) Quick Start — Basic Extraction

Start here to see a minimal schema + prompt flow.

- [`text-extraction`](./text-extraction): Sentiment + keyword extraction from short text.
- [`crm-search`](./crm-search): Turn a user request into structured CRM search queries.
- [`podcast-summary`](./podcast-summary): Summarize a transcript with timestamps and quotes.

## 2) Core Workflows — Templates, Recipes, and Batch Processing

Build reusable extraction setups and scale across inputs.

- [`batch-classification`](./batch-classification): Run many extractions concurrently and emit JSONL.
- [`synthetic-qa`](./synthetic-qa): Generate synthetic Q&A data with few-shot prompting.
- [`templated-support-triage`](./templated-support-triage): Use a template-driven setup in code.
- [`extraction-setup`](./extraction-setup): Write + load an extraction setup file with variables.
- [`recipe-system`](./recipe-system): Discover and load recipe-based setups.
- [`provider-matrix`](./provider-matrix): Compare providers/models and capture usage stats.
- [`thinking-comparison`](./thinking-comparison): Measure extraction quality under different thinking levels.

## 3) Reliability — Validation, Retry, Feedback

Add guardrails and structured retries for production robustness.

- [`validation-shell`](./validation-shell): Validate via a shell command.
- [`validation-http`](./validation-http): Validate via an HTTP endpoint.
- [`validation-retry`](./validation-retry): Retry on validation errors.
- [`retry-feedback`](./retry-feedback): Feed validation errors back into the model.
- [`streaming-json`](./streaming-json): CLI-style partial JSON streaming demo.

## 4) Production Performance — Caching and Warmup

Improve latency and reduce cost by reusing results.

- [`caching`](./caching): File-backed cache with extractions.
- [`warm-cache`](./warm-cache): Pre-warm cache entries.

## 5) Advanced & Special Cases — Multimodal, Routing, Graphs

Handle complex data sources and multi-model pipelines.

- [`vision-circle`](./vision-circle): Vision extraction example.
- [`model-handoff-receipt`](./model-handoff-receipt): Route between vision and reasoning models with validation.
- [`resolving-complex-entities`](./resolving-complex-entities): Entity resolution with Graphviz output.
