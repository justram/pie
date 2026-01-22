# Recipe system (CLI + SDK)

This example shows how to use the recipe system in both the CLI and the SDK.

The recipe lives at:

```
examples/recipe-system/.pie/recipes/support-triage/
```

## CLI

Run from the example directory so the recipe is discoverable under `./.pie/recipes`:

```bash
cd examples/recipe-system

pie --list-recipes

cat <<'EOF' | pie --recipe support-triage --verbose
Ticket 1287:
- Customer reports intermittent 500 errors after login.
- Impact is high during peak hours; retries sometimes succeed.
- Customer asked for an ETA and workaround.
- Agent suggested clearing cache; no improvement.
- Engineering suspects a load balancer timeout.
- Follow-up scheduled with Alex by Friday.
EOF

cat <<'EOF' | pie --recipe issue-summary --verbose
Ticket 1287:
- Customer reports intermittent 500 errors after login.
- Impact is high during peak hours; retries sometimes succeed.
- Customer asked for an ETA and workaround.
- Agent suggested clearing cache; no improvement.
- Engineering suspects a load balancer timeout.
- Follow-up scheduled with Alex by Friday.
EOF

cat <<'EOF' | pie --recipe action-plan --verbose
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
cat <<'EOF' | pie --recipe support-triage --model anthropic/claude-sonnet-4-5 --verbose
Ticket 1287:
- Customer reports intermittent 500 errors after login.
- Impact is high during peak hours; retries sometimes succeed.
- Customer asked for an ETA and workaround.
- Agent suggested clearing cache; no improvement.
- Engineering suspects a load balancer timeout.
- Follow-up scheduled with Alex by Friday.
EOF
```

## SDK

```bash
npm run build
npx tsx examples/recipe-system/run.ts support-triage
npx tsx examples/recipe-system/run.ts issue-summary
npx tsx examples/recipe-system/run.ts action-plan
```

This example loads the recipe using `loadRecipes()` and `loadRecipeSetup()`.
