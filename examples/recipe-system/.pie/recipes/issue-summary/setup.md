---
schema: schema.json
model: openai-codex/gpt-5.2
template: true
vars: '{"audience":"incident response","max_steps":4}'
---
Create a concise incident summary for {{ audience }}.

Include:
- Summary (1-2 sentences)
- Severity (low|medium|high|critical)
- Impact (who/what is affected)
- Root cause hypothesis (best guess)
- Next steps (max {{ max_steps }})
