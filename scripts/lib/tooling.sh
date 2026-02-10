#!/usr/bin/env bash

if [[ -z "${ROOT_DIR:-}" ]]; then
	ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

TOOLING_TOML="${TOOLING_TOML:-$ROOT_DIR/tooling.toml}"

tooling_require_config() {
	if [[ ! -f "$TOOLING_TOML" ]]; then
		echo "missing tooling config: $TOOLING_TOML" >&2
		exit 2
	fi
}

tooling_value() {
	local key="$1"
	awk -v key="$key" '
		BEGIN { in_tooling = 0 }
		/^\[tooling\][[:space:]]*$/ { in_tooling = 1; next }
		in_tooling && /^\[[^]]+\][[:space:]]*$/ { in_tooling = 0 }
		in_tooling {
			line = $0
			sub(/#.*/, "", line)
			if (line ~ "^[[:space:]]*" key "[[:space:]]*=") {
				sub("^[[:space:]]*" key "[[:space:]]*=[[:space:]]*\"", "", line)
				sub("\"[[:space:]]*$", "", line)
				print line
				exit
			}
		}
	' "$TOOLING_TOML"
}

tooling_normalize_version() {
	local raw="$1"
	echo "$raw" | sed -E 's/^[^0-9]*([0-9]+(\.[0-9]+){0,3}).*/\1/'
}

tooling_version_ge() {
	local actual required
	actual="$(tooling_normalize_version "$1")"
	required="$(tooling_normalize_version "$2")"
	[[ -n "$actual" && -n "$required" ]] || return 1
	[[ "$(printf '%s\n%s\n' "$required" "$actual" | sort -V | head -n1)" == "$required" ]]
}

tooling_require_value() {
	local key="$1"
	local value
	value="$(tooling_value "$key")"
	if [[ -z "$value" ]]; then
		echo "missing '$key' in [tooling] section of $TOOLING_TOML" >&2
		exit 2
	fi
	echo "$value"
}
