#!/usr/bin/env bash
# Runs the smoke specs in Playwright's Linux image, the browser CI uses, so a
# Windows-only pass shows up before a push. Needs Docker running.
#
#   scripts/smoke-linux.sh                 the specs this branch changes, as CI picks them
#   scripts/smoke-linux.sh ALL             the whole suite
#   scripts/smoke-linux.sh fishbone-diagram -g "menus"   any Playwright arguments
#
# It tests the committed tree plus uncommitted changes to tracked files, with LF
# line endings as a Linux checkout has them. New untracked files are left out:
# add them first. The report lands in tests/smoke/test-results/linux/.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
VERSION=$(node -p "require('./tests/smoke/node_modules/@playwright/test/package.json').version" 2>/dev/null \
  || node -p "require('./tests/smoke/package.json').devDependencies['@playwright/test']")
IMAGE="mcr.microsoft.com/playwright:v${VERSION}-noble"

if [ "$#" -eq 0 ]; then
  BASE=$(git merge-base HEAD origin/main)
  set -- $( { git diff --name-only "$BASE"; git ls-files --others --exclude-standard; } | sort -u | node tests/smoke/select-specs.cjs)
fi
if [ "${1:-}" = "ALL" ]; then shift; fi
echo "Image: $IMAGE"
echo "Running: ${*:-the whole suite}"

# A stash commit holds the uncommitted tracked changes without touching the working tree.
REF=$(git stash create)
OUT="$ROOT/tests/smoke/test-results/linux"
rm -rf "$OUT" && mkdir -p "$OUT"

# Git Bash rewrites /paths in arguments; the container needs them as written.
export MSYS_NO_PATHCONV=1
git -c core.autocrlf=false archive --format=tar "${REF:-HEAD}" \
  | docker run --rm -i --ipc=host -e CI=1 -v "$OUT:/out" "$IMAGE" bash -c '
      set -e
      mkdir /w && tar -x -C /w && cd /w/tests/smoke
      npm ci --no-audit --no-fund --loglevel=error
      status=0
      npx playwright test --config=playwright.config.cjs "$@" || status=$?
      cp -r playwright-report test-results /out/ 2>/dev/null || true
      exit $status' bash "$@"
