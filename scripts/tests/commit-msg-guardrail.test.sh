#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

cp -R "$repo_root/.githooks" "$tmp_root/.githooks"
cd "$tmp_root"
git init -q
git config user.name 'Guardrail Test'
git config user.email 'guardrail-test@example.invalid'
mkdir -p docs/product playwright src/__tests__
cat > docs/product/experience.md <<'DOC'
# Experience
Status: Approved
Approved by: Test Owner
Change policy: Explicit approval required
DOC
cat > docs/product/café.md <<'DOC'
# Café experience
Status: Approved
Approved by: Test Owner
Change policy: Explicit approval required
DOC
printf '# Browser tests\n' > playwright/README.md
printf 'test("legacy", () => {});\n' > src/__tests__/old.test.ts
git add docs/product/experience.md docs/product/café.md playwright/README.md src/__tests__/old.test.ts
git -c core.hooksPath=/dev/null commit -qm 'test: establish guardrail fixture'

write_message() {
  local change_type="$1"
  local behavior_doc="$2"
  local tests_updated="$3"
  local approval="$4"
  local approval_source="$5"
  cat > "$tmp_root/message.txt" <<MSG
$change_type(test): exercise guardrail

Change-Type: $change_type
Behavior-Doc: $behavior_doc
Tests-Updated: $tests_updated
Approval: $approval
Approval-Source: $approval_source
MSG
}

expect_fail() {
  local label="$1"
  if "$tmp_root/.githooks/commit-msg" "$tmp_root/message.txt" >/dev/null 2>&1; then
    printf 'FAIL: %s unexpectedly passed\n' "$label" >&2
    exit 1
  fi
  printf 'PASS: %s blocked\n' "$label"
}

reset_fixture() {
  git reset --hard -q HEAD
  rm -rf docs/notes docs/system tests
  rm -f docs/approval-source.md docs/approval0.md 'docs/approval?.md' playwright/change.spec.ts playwright/mosaic.spec.ts
}

rm docs/product/experience.md
git add -u docs/product/experience.md
write_message docs n/a n/a n/a n/a
expect_fail 'approved behavior doc deletion'

sed -i '1s/.*/Revert ordinary-looking subject/' "$tmp_root/message.txt"
expect_fail 'Revert-prefixed approved behavior doc deletion'
reset_fixture

sed -i 's/^Status: Approved$/Status: Superseded/' docs/product/experience.md
git add docs/product/experience.md
write_message docs n/a n/a n/a n/a
expect_fail 'approved behavior doc demotion'
reset_fixture

mkdir -p docs/system
git mv docs/product/experience.md docs/system/experience.md
write_message docs n/a n/a n/a n/a
expect_fail 'approved behavior doc moved out of product docs'
reset_fixture

rm docs/product/experience.md
ln -s ../system/experience.md docs/product/experience.md
git add docs/product/experience.md
write_message docs n/a n/a n/a n/a
expect_fail 'approved behavior doc replaced by symlink'
reset_fixture

printf '\nUpdated Unicode behavior.\n' >> docs/product/café.md
git add docs/product/café.md
write_message docs n/a n/a n/a n/a
expect_fail 'approved behavior doc with Unicode path'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
mkdir -p docs/notes
printf '# Policy spec documentation\n' > docs/notes/policy.spec.md
git add docs/product/experience.md docs/notes/policy.spec.md
write_message behavior docs/product/experience.md yes explicit chat:guardrail-test
expect_fail 'documentation file with spec-like name as test evidence'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
mkdir -p tests
printf 'export const helper = true;\n' > tests/helper.ts
git add docs/product/experience.md tests/helper.ts
write_message behavior docs/product/experience.md yes explicit chat:guardrail-test
expect_fail 'test-directory helper as test evidence'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
printf '\nUpdated browser documentation.\n' >> playwright/README.md
git add docs/product/experience.md playwright/README.md
write_message behavior docs/product/experience.md yes explicit chat:guardrail-test
expect_fail 'Playwright README as test evidence'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
rm src/__tests__/old.test.ts
git add docs/product/experience.md
git add -u src/__tests__/old.test.ts
write_message behavior docs/product/experience.md yes explicit chat:guardrail-test
expect_fail 'deleted test as behavior evidence'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
printf 'test("behavior", () => {});\n' > playwright/mosaic.spec.ts
git add docs/product/experience.md playwright/mosaic.spec.ts
write_message behavior docs/product/experience.md yes explicit .
expect_fail 'directory approval source'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
printf 'test("behavior", () => {});\n' > playwright/mosaic.spec.ts
ln -s approval-target docs/approval-source.md
git add docs/product/experience.md docs/approval-source.md playwright/mosaic.spec.ts
rm docs/approval-source.md
printf 'working-tree facade\n' > docs/approval-source.md
write_message behavior docs/product/experience.md yes explicit docs/approval-source.md
expect_fail 'staged symlink approval source behind regular-file facade'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
printf 'regular approval artifact\n' > docs/approval0.md
ln -s approval-target 'docs/approval?.md'
printf 'test("behavior", () => {});\n' > playwright/mosaic.spec.ts
git add docs/product/experience.md docs/approval0.md 'docs/approval?.md' playwright/mosaic.spec.ts
write_message behavior docs/product/experience.md yes explicit 'docs/approval?.md'
expect_fail 'pathspec-like symlink approval source'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
ln -s ../README.md playwright/change.spec.ts
git add docs/product/experience.md playwright/change.spec.ts
write_message behavior docs/product/experience.md yes explicit chat:guardrail-test
expect_fail 'staged symlink as test evidence'
reset_fixture

: > docs/product/experience.md
printf 'test("behavior", () => {});\n' > playwright/mosaic.spec.ts
git add docs/product/experience.md playwright/mosaic.spec.ts
write_message behavior docs/product/experience.md yes explicit chat:guardrail-test
expect_fail 'empty approved behavior doc'
reset_fixture

printf '\nUpdated behavior.\n' >> docs/product/experience.md
printf 'test("behavior", () => {});\n' > playwright/mosaic.spec.ts
git add docs/product/experience.md playwright/mosaic.spec.ts
write_message behavior docs/product/experience.md yes explicit chat:guardrail-test
"$tmp_root/.githooks/commit-msg" "$tmp_root/message.txt"
printf 'PASS: approved behavior change with real test evidence\n'
