#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'guardrail check: %s\n' "$*" >&2
  exit 1
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$repo_root"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail 'not inside a git repository'

hooks_path="$(git config --get core.hooksPath || true)"
commit_template="$(git config --get commit.template || true)"

[[ "$hooks_path" == '.githooks' ]] || fail 'core.hooksPath must be .githooks'
[[ "$commit_template" == '.gitmessage' ]] || fail 'commit.template must be .gitmessage'

for file in .githooks/commit-msg .githooks/install.sh .githooks/pre-push .gitmessage; do
  [[ -e "$file" ]] || fail "$file is missing"
done

[[ -x .githooks/commit-msg ]] || fail '.githooks/commit-msg must be executable'
[[ -x .githooks/install.sh ]] || fail '.githooks/install.sh must be executable'
[[ -x .githooks/pre-push ]] || fail '.githooks/pre-push must be executable'

printf 'guardrail check: PASS\n'
