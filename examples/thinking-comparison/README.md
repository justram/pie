# Thinking Comparison Example

Demonstrates how the `thinking` option affects extraction accuracy on complex reasoning tasks.

## The Problem

A multi-step portfolio calculation involving:
- Stock splits (3:1 forward split)
- Reverse splits (1:2 reverse split)  
- Multiple position calculations
- Aggregate metrics

This type of problem commonly trips up LLMs without extended thinking because:
1. Split calculations require careful reasoning about share multiplication
2. Multiple steps compound errors
3. Reverse splits are counter-intuitive (fewer shares, not more)

## Expected Behavior

| Thinking Level | Expected Result |
|----------------|-----------------|
| `"off"` | May fail validation due to calculation errors |
| `"high"` | Should succeed with correct calculations |

## Run

```bash
# Default (Anthropic Claude Sonnet 4)
npx tsx examples/thinking-comparison/run.ts

# Specify provider/model
npx tsx examples/thinking-comparison/run.ts anthropic claude-sonnet-4
npx tsx examples/thinking-comparison/run.ts google gemini-2.5-pro

# OAuth providers (will prompt for login if needed)
npx tsx examples/thinking-comparison/run.ts google-antigravity gemini-3-pro
npx tsx examples/thinking-comparison/run.ts openai-codex gpt-5.2
```

## Supported Providers

| Provider | Auth | Example Models |
|----------|------|----------------|
| `anthropic` | `ANTHROPIC_API_KEY` env | `claude-sonnet-4` |
| `openai` | `OPENAI_API_KEY` env | `gpt-4o` |
| `google` | `GOOGLE_API_KEY` env | `gemini-2.5-pro` |
| `google-antigravity` | OAuth (interactive) | `gemini-3-pro`, `gemini-3-pro-high` |
| `openai-codex` | OAuth (interactive) | `gpt-5.2` |

## Sample Output

```
Model: anthropic:claude-sonnet-4 (reasoning: yes)

──────────────────────────────────────────────────
🧠 Running with thinking: "off"
──────────────────────────────────────────────────
  [off] Validation: Company B shares: expected 50000, got 100000 (100.0% off)
  [off] Turn 1 failed, retrying...

❌ FAILED
   Extraction failed after 3 turns

──────────────────────────────────────────────────
🧠 Running with thinking: "high"
──────────────────────────────────────────────────

✅ SUCCESS
   Turns: 1 | Tokens: 12,345 | Cost: $0.0234 | Time: 8.2s

   Positions:
   Company A: 600,000 shares @ $8 = $4,800,000 (📈 $2,800,000)
   Company B: 50,000 shares @ $45 = $2,250,000 (📈 $750,000)
   Company C: 40,000 shares @ $18 = $720,000 (📉 -$280,000)

   Total Invested: $4,500,000
   Current Value:  $7,770,000
   Return:         72.67%
```

## Warning Event

If you use a model that doesn't support extended thinking, pie emits a warning:

```
  ⚠️  Model "openai:gpt-4o-mini" does not support extended thinking. The 'thinking' option will be ignored.
```

The extraction still runs, but without thinking enabled.

## Key Insight

Extended thinking helps the model:
1. **Track state changes** - Shares before/after each split
2. **Avoid common errors** - Reverse splits are tricky (shares ÷2, not ×2)
3. **Self-verify** - Can check intermediate results before final answer
