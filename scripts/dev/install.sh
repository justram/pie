#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "missing command: $1" >&2
		exit 1
	fi
}

require_cmd node
require_cmd npm
require_cmd npx

echo "Installing npm dependencies"
npm install

echo "Installing prek hooks"
npx --no-install prek install
npx --no-install prek install-hooks
npx --no-install prek install -t pre-push

echo "Done. Next run: ./scripts/dev/bootstrap_check.sh"
