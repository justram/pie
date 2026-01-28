# Release checklist

## Patch/minor release workflow

1. Ensure CHANGELOG.md is updated under `[Unreleased]`.
2. Run the release script:

```bash
npm run release:patch
# or
npm run release:minor
```

3. Push the tag:

```bash
npm run release:push
```

4. Publish the GitHub release from the CHANGELOG notes:

```bash
npm run release:github
```

## Notes

- The release scripts handle version bumps, CHANGELOG finalization, commit, tag, and npm publish.
- GitHub releases are created or updated from the matching `CHANGELOG.md` section.
- Major releases are not supported by policy.
