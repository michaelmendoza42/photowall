# e01s02 — Versioned Media Identity

## Purpose
Ensure immutable browser and persistent derivative caches cannot serve media from a changed source or a different configured library root.

## Requirement delta

### MODIFIED — Media cache identity
**Before:** browser media URLs are unversioned and derivative keys omit library-root identity.

**After:** media URLs carry source version metadata and cache keys include the configured root; legacy cache files remain untouched until a separately approved cleanup.

## Acceptance criteria

```gherkin
Scenario: source changes
  Given a browser has cached a derivative immutably
  When its source metadata changes in a new snapshot
  Then the wall uses a new media URL and fetches the new derivative

Scenario: library root changes
  Given two configured roots contain identical photo IDs and source metadata
  When each root serves a derivative through the same data directory
  Then their cache keys differ
```

## Tasks
1. Add versioned media URL contract through query records, wall, hover, and modal paths → verify: `npx vitest run src/server/routes/__tests__/media.test.ts src/server/media/__tests__/cache-key.test.ts --pool=threads --maxWorkers=1 --minWorkers=1`
2. Preserve root identity in derivative keys and regression tests → verify: `npx vitest run src/server/media/__tests__/cache-key.test.ts src/server/media/__tests__/source-resolver.test.ts --pool=threads --maxWorkers=1 --minWorkers=1`

## Risks and rollback
No cache deletion is allowed. URL versioning must remain compatible with safe server request parsing.
