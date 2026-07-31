#!/usr/bin/env bash
set -euo pipefail

failures=0

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$repo_root"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  printf 'migration check: not inside a git repository\n' >&2
  exit 1
}

pass() {
  printf 'migration check: OK: %s\n' "$*"
}

fail() {
  printf 'migration check: FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

required_paths=(
  AGENTS.md
  README.md
  docs/README.md
  docs/glossary.md
  docs/product/README.md
  docs/workshop-ideas/README.md
  docs/system/README.md
  docs/standards/README.md
  docs/runbooks/README.md
  docs/decisions/README.md
  work/README.md
  work/plans/README.md
  work/tasks/README.md
)

legacy_paths=(
  docs/adr
  docs/domain
  docs/special
  plans
  tasks
)

for path in "${required_paths[@]}"; do
  if [[ -e "$path" ]]; then
    pass "required path present: $path"
  else
    fail "required path missing: $path"
  fi
done

for path in "${legacy_paths[@]}"; do
  if [[ -e "$path" ]]; then
    fail "legacy path still present: $path"
  else
    pass "legacy path absent: $path"
  fi
done

search_roots=(AGENTS.md README.md docs work scratch scripts warp-pipe .github)
existing_search_roots=()
for path in "${search_roots[@]}"; do
  [[ -e "$path" ]] && existing_search_roots+=("$path")
done

legacy_matches=''
if command -v rg >/dev/null 2>&1; then
  legacy_matches="$(rg -n --color never \
    --glob '!docs/runbooks/migrating-doc-structure.md' \
    --glob '!scripts/check-migration.sh' \
    -e 'docs/adr/' \
    -e 'docs/domain/' \
    -e 'docs/special/' \
    -e 'plans/active/' \
    -e 'plans/archived/' \
    "${existing_search_roots[@]}" || true)"
else
  legacy_matches="$(grep -RInE \
    'docs/adr/|docs/domain/|docs/special/|plans/active/|plans/archived/' \
    "${existing_search_roots[@]}" \
    --exclude='check-migration.sh' \
    --exclude='migrating-doc-structure.md' || true)"
fi

if [[ -n "$legacy_matches" ]]; then
  fail 'legacy taxonomy references remain in current docs/scripts:'
  printf '%s\n' "$legacy_matches" >&2
else
  pass 'no stale legacy taxonomy references found outside intentional migration history'
fi

if [[ "$failures" -gt 0 ]]; then
  printf 'migration check: FAILED with %s issue(s)\n' "$failures" >&2
  exit 1
fi

printf 'migration check: PASS\n'
