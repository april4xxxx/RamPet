# Project Instructions

## Versioning

- Keep `package.json`, `package-lock.json`, and the latest released `docs/CHANGELOG.md` version in sync.
- `package.json` is the source version used by Electron Builder for the app metadata and DMG filename.
- Do not edit the version in only one file.
- Daily development changes do not need a version bump.
- For release builds, use one of these scripts from the project root:
  - `npm run release:patch -- "short changelog note"`
  - `npm run release:minor -- "short changelog note"`
  - `npm run release:major -- "short changelog note"`
- Use `patch` for small fixes, copy/text/asset adjustments, and behavior tweaks.
- Use `minor` for user-visible feature additions.
- Use `major` only for breaking or large product resets.

## Changelog

- Every code, asset, or documentation change should be reflected in `docs/CHANGELOG.md`.
- During normal development, add changes under `## [Unreleased]`.
- Do not create a new numbered changelog section manually during normal development.
- The newest released changelog entry must match the package version before a DMG is sent out.
- Keep entries concrete and user-facing where possible.
- Do not create a release package if the changelog and package version disagree.
- The release scripts move the accumulated `Unreleased` notes into the new version section.

## Packaging

- Normal local build check: `npm run build`
- Distributable macOS package: `npm run release:patch -- "short changelog note"` unless the change clearly needs `minor` or `major`.
- If the current version was already bumped and documented, use `npm run dist:mac` to package that exact version without bumping again.
- The generated DMG is written to `release/RamPet-<version>-arm64.dmg`.
