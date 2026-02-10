---
name: release-changelog
description: Syncs CHANGELOG.md [Unreleased] from git-cliff and optionally commits the changelog-only update. Use after code commits when preparing release notes or finalizing changelog entries.
---

# Release Changelog

Automates the final changelog pass for this repository.

## What it does

- Runs `just changelog sync` to regenerate `CHANGELOG.md` `[Unreleased]` from `git-cliff`.
- Checks whether `CHANGELOG.md` actually changed.
- If changed, stages and commits `CHANGELOG.md` with a changelog-only commit message.

## Usage

Run from repository root:

```bash
./skills/release-changelog/finalize.sh
```

Custom commit message:

```bash
./skills/release-changelog/finalize.sh "docs(changelog): sync unreleased notes"
```

Preview only (no file updates, no commit):

```bash
./skills/release-changelog/finalize.sh --dry-run
```

## Notes

- Requires `just`, `git`, and `git-cliff` installed.
- Intended to be run after feature/fix commits.
- If no changelog diff is produced, the script exits successfully without creating a commit.
