---
schema: setup-schema.json
model: openai-codex/gpt-5.2
template: true
vars: '{"task_name":"support triage","domain":"customer support tickets","required_fields":["summary","sentiment","issues","action items"],"include_quotes":true,"issue_areas":["authentication","performance","billing","usability"]}'
---
You are performing {{ task_name }} for {{ domain }}.

Output must include:
{% for field in required_fields %}
- {{ field }}
{% endfor %}

Prioritize issues in these areas:
{% for area in issue_areas %}
- {{ area }}
{% endfor %}

{% if include_quotes %}
Include up to {{ max_quotes }} short quotes supporting the issues.
{% endif %}