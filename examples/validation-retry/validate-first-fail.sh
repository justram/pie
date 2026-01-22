#!/usr/bin/env bash
set -euo pipefail

sentinel="${PIE_VALIDATION_SENTINEL:-}"
if [[ -z "$sentinel" ]]; then
	echo "PIE_VALIDATION_SENTINEL is not set." >&2
	exit 1
fi

if [[ ! -f "$sentinel" ]]; then
	printf "first-fail" >"$sentinel"
	echo "Intentional validation failure (first call)." >&2
	exit 1
fi

# Second call passes.
cat >/dev/null
