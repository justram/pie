---
schema: schema.json
model: openai-codex/gpt-5.2
template: true
vars: '{"audience":"support operations","max_steps":5}'
---
Create a structured action plan for {{ audience }}.

Include:
- Goal (single sentence)
- Steps (max {{ max_steps }}, ordered, each with owner and timeline)
- Risks (key execution risks)
