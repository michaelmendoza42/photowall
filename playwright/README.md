# Playwright browser tests

Browser regression coverage for the wall interaction contract lives here.

## What this harness does

- regenerates the committed smoke fixtures before boot
- builds the client and server once per run
- starts the production-style Fastify app on `http://127.0.0.1:3110`
- points the app at `fixtures/library-smoke`
- uses an isolated temporary data directory for each run
- saves screenshots on failure and retains traces on failure

## First-time setup

```bash
npx playwright install chromium
```

## Run the suite

```bash
npm run test:browser
```

## Artifacts

- HTML report: `playwright-report/`
- failure screenshots and traces: `test-results/playwright/`

## Covered flow

- anchored hover preview appears for a wall tile
- hover preview is approximately halfway between the current tile size and the clicked focused-photo modal size
- sub-threshold pointer jitter still opens the correct focused-photo modal
- drag-threshold crossings pan the wall and suppress modal opening
