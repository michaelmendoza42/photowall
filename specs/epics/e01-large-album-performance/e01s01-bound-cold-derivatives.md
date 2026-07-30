# e01s01 — Bound Cold Derivative Work

## Purpose
Prevent a large album’s first visible wall from overloading Sharp, disk, and memory with duplicate or unbounded cold derivative renders.

## Requirement delta

### MODIFIED — Cold media delivery
**Before:** each cache-miss request independently renders a derivative; simultaneous same-key requests can duplicate work and distinct requests have no application-level cap.

**After:** equivalent cold requests share one render; a bounded queue admits only a small number of distinct cold renders while cache hits return immediately.

## Acceptance criteria

```gherkin
Scenario: concurrent requests for one uncached derivative
  Given the derivative cache does not contain a requested wall image
  When multiple clients request that same photo, variant, and format concurrently
  Then one render is performed
  And every client receives the same completed file

Scenario: cold burst with a warm cache hit
  Given all render permits are occupied by cold derivatives
  When a client requests an already cached derivative
  Then it returns without waiting for the cold-render queue

Scenario: failed render
  Given a cold derivative render fails
  When another queued derivative waits for a permit
  Then the permit is released
  And the queued derivative can continue
```

## Tasks
1. Add same-key in-flight coalescing and bounded admission to `DerivativeService` → verify: `npx vitest run src/server/media/__tests__/derivative-service.test.ts --pool=threads --maxWorkers=1 --minWorkers=1`
2. Add queue/cache structured diagnostics and failure-release coverage → verify: `npx vitest run src/server/media/__tests__/derivative-service.test.ts --pool=threads --maxWorkers=1 --minWorkers=1`

## Risks and rollback
The queue must never delay cache hits or leak permits. Rollback is removal of the in-flight/permit layer; no persisted data changes.
