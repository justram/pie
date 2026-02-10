#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck disable=SC1091
source "$ROOT_DIR/scripts/lib/tooling.sh"
tooling_require_config

NODE_MIN="$(tooling_require_value node_min)"
NPM_MIN="$(tooling_require_value npm_min)"
BIOME_MIN="$(tooling_require_value biome_min)"
TYPESCRIPT_MIN="$(tooling_require_value typescript_min)"
VITEST_MIN="$(tooling_require_value vitest_min)"
ESLINT_MIN="$(tooling_require_value eslint_min)"
PREK_MIN="$(tooling_require_value prek_min)"
JUST_MIN="$(tooling_require_value just_min)"
GIT_CLIFF_MIN="$(tooling_require_value git_cliff_min)"

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
require_cmd npx
require_cmd git
require_cmd just

node_version="$(node --version | sed -E 's/^v//')"
npm_version="$(npm --version)"

check_min_version node "$node_version" "$NODE_MIN"
check_min_version npm "$npm_version" "$NPM_MIN"

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
	echo "node_modules not found. Run: npm install" >&2
	exit 1
fi

cd "$ROOT_DIR"
biome_version="$(npx --no-install biome --version | awk '{print $2}')"
typescript_version="$(npx --no-install tsc --version | awk '{print $2}')"
vitest_version="$(npx --no-install vitest --version | awk '{print $1}' | sed -E 's#^vitest/##')"
eslint_version="$(npx --no-install eslint --version | sed -E 's/^v//')"
prek_version="$(npx --no-install prek --version | awk '{print $2}')"
just_version="$(just --version | awk '{print $2}')"

check_min_version biome "$biome_version" "$BIOME_MIN"
check_min_version typescript "$typescript_version" "$TYPESCRIPT_MIN"
check_min_version vitest "$vitest_version" "$VITEST_MIN"
check_min_version eslint "$eslint_version" "$ESLINT_MIN"
check_min_version prek "$prek_version" "$PREK_MIN"
check_min_version just "$just_version" "$JUST_MIN"

if command -v git-cliff >/dev/null 2>&1; then
	git_cliff_version="$(git-cliff --version | awk '{print $2}')"
	check_min_version git-cliff "$git_cliff_version" "$GIT_CLIFF_MIN"
else
	git_cliff_version="not installed (optional; required for changelog automation)"
fi

echo "bootstrap-check: PASS"
echo "- node:       $node_version"
echo "- npm:        $npm_version"
echo "- biome:      $biome_version"
echo "- typescript: $typescript_version"
echo "- vitest:     $vitest_version"
echo "- eslint:     $eslint_version"
echo "- prek:       $prek_version"
echo "- just:       $just_version"
echo "- git-cliff:  $git_cliff_version"
