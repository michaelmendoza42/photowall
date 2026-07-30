# e01s04 — Performance Regression Protection

## Purpose
Provide deterministic large-album and mobile interaction evidence before performance changes are considered ready for review.

## Requirement delta

### ADDED — Performance regression evidence
The project provides repeatable synthetic large-album checks plus desktop and mobile Playwright scenarios for initial overview, bounded resource work, and mobile pinch/button zoom.

## Acceptance criteria

```gherkin
Scenario: mobile zoom
  Given a coarse-pointer device
  When the user pinches or uses zoom controls
  Then wall zoom changes without breaking drag panning

Scenario: large-album overview
  Given a deterministic large-album fixture
  When the wall opens at overview zoom
  Then the initial visible work stays within documented request/texture bounds
```

## Tasks
1. Add deterministic large-album fixture and diagnostics → verify: `npx vitest run src/client/src/features/wall/__tests__/ --pool=threads --maxWorkers=1 --minWorkers=1`
2. Add desktop/mobile Playwright performance scenarios → verify: `npx playwright test playwright/mobile-pinch-zoom.spec.ts playwright/zoom-detail-tiers.spec.ts --project=chromium-mobile`

## Risks and rollback
Benchmarks must be deterministic and must not depend on the personal photography library or delete live caches.
