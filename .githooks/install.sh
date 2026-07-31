#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$repo_root"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  printf 'error: not inside a git repository\n' >&2
  exit 1
}

git config core.hooksPath .githooks
git config commit.template .gitmessage

printf 'Configured local git guardrails in %s\n' "$repo_root"
printf '  core.hooksPath = .githooks\n'
printf '  commit.template = .gitmessage\n'
