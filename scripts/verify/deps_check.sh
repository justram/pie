#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/tooling.sh"
tooling_require_config

NODE_MIN="$(tooling_require_value node_min)"
NPM_MIN="$(tooling_require_value npm_min)"

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "missing command: $1" >&2
		exit 1
	fi
}

check_min_version() {
	local label="$1"
	local actual="$2"
	local required="$3"
	if ! tooling_version_ge "$actual" "$required"; then
		echo "$label version too old: have $actual, need >= $required" >&2
		exit 1
	fi
}

require_cmd node
require_cmd npm
require_cmd git

node_version="$(node --version | sed -E 's/^v//')"
npm_version="$(npm --version)"

check_min_version node "$node_version" "$NODE_MIN"
check_min_version npm "$npm_version" "$NPM_MIN"

cd "$ROOT_DIR"

if [[ ! -f package-lock.json ]]; then
	echo "missing package-lock.json" >&2
	exit 1
fi

echo "Verifying lockfile/install determinism (npm ci --dry-run)"
npm ci --ignore-scripts --dry-run >/dev/null

echo "Verifying dependency graph (npm ls)"
npm ls --all >/dev/null

echo "deps-check: PASS"
echo "- node: $node_version"
echo "- npm:  $npm_version"
