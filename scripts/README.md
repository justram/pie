# Scripts guide

This directory is organized by purpose so contributors can discover workflows quickly.
Pinned tool versions live in `tooling.toml`.

## Mindmap

- `dev/` — local environment install and bootstrap checks
- `release/` — release helpers and changelog automation
- `verify/` — dependency/tooling verification scripts

## Common workflows

### Daily development

```bash
just dev-install
just bootstrap-check
just check
just test full
just build
```

### Formatting / fixing

```bash
just fmt
```

### Dependency verification

```bash
just deps-check
```

### Changelog generation from commits

```bash
just changelog preview
just changelog sync
```

### Release

```bash
just release patch
just release minor
npm run release:push
```
