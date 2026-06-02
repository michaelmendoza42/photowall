# `fixtures/`

Scanner and integration test fixtures.

- `library-smoke/` — happy-path mock library for default tests. Also acts as
  the default mount target for `docker compose` so the app boots even without
  a real `PHOTO_WALL_HOST_LIBRARY_PATH`.
- `library-edge/` — edge-case library (symlinks, unsupported files, corrupt
  images, yearless paths) for hardening tests.
- `manifest.json` — declarative expected shape for each fixture library. The
  scanner phase will populate the actual photo files and tighten the
  `expected` blocks in this manifest.

Today both directories are intentionally empty placeholders so the runtime
boots and the contract is in place; the scanner task fills them in.
