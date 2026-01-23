# pie agent context

## Purpose
`pie` is a structured extraction library and CLI built on `@mariozechner/pi-ai`.

## Start here
- [`docs/agent/index.md`](docs/agent/index.md): Onboarding entry point and links.
- [`docs/architecture.md`](docs/architecture.md): High-level layout.
- [`docs/agent/reports.md`](docs/agent/reports.md): Pre-indexed deep dive.

## When you need more detail
- [`docs/agent/guidelines.md`](docs/agent/guidelines.md): Conventions, workflows, and constraints.
- [`examples/`](examples/): Usage patterns and runnable demos.

## Releasing
Lockstep versioning: All packages always share the same version number. Every release updates all packages together.

Version semantics (no major releases):

patch: Bug fixes and new features
minor: API breaking changes
Steps
Update CHANGELOGs: Ensure all changes since last release are documented in the [Unreleased] section of each affected package's CHANGELOG.md

Run release script:

npm run release:patch    # Fixes and additions
npm run release:minor    # API breaking changes
The script handles: version bump, CHANGELOG finalization, commit, tag, publish, and adding new [Unreleased] sections.
