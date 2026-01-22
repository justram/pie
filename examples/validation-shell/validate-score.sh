#!/usr/bin/env bash
set -euo pipefail

data=$(cat)

if ! echo "$data" | jq -e '.score | type == "number"' >/dev/null; then
	echo "Missing or invalid score field." >&2
	exit 1
fi

if ! echo "$data" | jq -e '.score >= 0.5' >/dev/null; then
	score=$(echo "$data" | jq -r '.score')
	echo "Score too low: ${score}" >&2
	exit 1
fi
