# Template-driven setup: support triage (CLI)

This example demonstrates using the `pie` CLI with a **setup-style prompt file** (frontmatter + Jinja template). The CLI reads `setup.md`, renders the template, and runs a structured extraction loop without custom config code.

## Run

```bash
cat <<'EOF' | pie --prompt-file examples/templated-support-triage/setup.md --verbose
Ticket 1287:
- Customer reports intermittent 500 errors after login.
- Impact is high during peak hours; retries sometimes succeed.
- Customer asked for an ETA and workaround.
- Agent suggested clearing cache; no improvement.
- Engineering suspects a load balancer timeout.
- Follow-up scheduled with Alex by Friday.
EOF
```

Inline the setup document via `--prompt` (same content):

```bash
pie --prompt "$(cat examples/templated-support-triage/setup.md)" --verbose <<'EOF'
Ticket 1287:
- Customer reports intermittent 500 errors after login.
- Impact is high during peak hours; retries sometimes succeed.
- Customer asked for an ETA and workaround.
- Agent suggested clearing cache; no improvement.
- Engineering suspects a load balancer timeout.
- Follow-up scheduled with Alex by Friday.
EOF
```

Override the model defined in `setup.md`:

```bash
pie --prompt-file examples/templated-support-triage/setup.md \
  --model anthropic/claude-sonnet-4-5 \
  --verbose <<'EOF'
Ticket 1287:
- Customer reports intermittent 500 errors after login.
- Impact is high during peak hours; retries sometimes succeed.
- Customer asked for an ETA and workaround.
- Agent suggested clearing cache; no improvement.
- Engineering suspects a load balancer timeout.
- Follow-up scheduled with Alex by Friday.
EOF
```

Adjust template variables directly in the `vars` field of the setup frontmatter (for example, `max_quotes`).

This example uses OAuth for `openai-codex` if you keep the default model (see `examples/_shared/oauth.ts`).
