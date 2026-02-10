#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT_DIR" ]]; then
	ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi
cd "$ROOT_DIR"

DEFAULT_MESSAGE="docs(changelog): sync unreleased notes with git-cliff"

if [[ "${1:-}" == "--dry-run" ]]; then
	just changelog preview
	exit 0
fi

commit_message="${1:-$DEFAULT_MESSAGE}"

just changelog sync

if git diff --quiet -- CHANGELOG.md; then
	echo "No changelog changes to commit."
	exit 0
fi

git add CHANGELOG.md
git commit -m "$commit_message"

echo "Committed changelog update: $commit_message"
