#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/root/.bun/bin:${PATH:-}"
export GIT_AUTHOR_NAME="${GIT_AUTHOR_NAME:-llman-sdd eval}"
export GIT_AUTHOR_EMAIL="${GIT_AUTHOR_EMAIL:-eval@llman-sdd.local}"
export GIT_COMMITTER_NAME="${GIT_COMMITTER_NAME:-llman-sdd eval}"
export GIT_COMMITTER_EMAIL="${GIT_COMMITTER_EMAIL:-eval@llman-sdd.local}"
git config --global --add safe.directory /app || true
git config --global user.email "$GIT_COMMITTER_EMAIL" || true
git config --global user.name "$GIT_COMMITTER_NAME" || true
# Copy the host-mounted seed into the writable workdir. Do not copy /opt/llman-sdd.
cp -a /opt/seed/. /app/
cd /app
# Host dist binaries link host ICU; use bun src inside the eval image.
if [ -f /opt/llman-sdd/apps/cli/src/main.ts ]; then
  LLMAN="bun /opt/llman-sdd/apps/cli/src/main.ts"
elif [ -x /opt/llman-sdd/apps/cli/dist/llman-sdd ]; then
  LLMAN=/opt/llman-sdd/apps/cli/dist/llman-sdd
else
  echo "eval setup: no llman-sdd CLI under /opt/llman-sdd" >&2
  exit 1
fi
export LLMAN
if [ ! -d .git ]; then
  git init -b main
  git add -A
  git -c user.email="$GIT_COMMITTER_EMAIL" -c user.name="$GIT_COMMITTER_NAME" commit -m "seed"
fi
if [ ! -d llmanspec ]; then
  $LLMAN init --locale zh-Hans
fi
if ! grep -q 'run_command: bun test' llmanspec/config.yaml; then
  printf '\nbdd:\n  run_command: bun test\n' >> llmanspec/config.yaml
fi
test -f .agents/skills/llman-sdd-explore/SKILL.md
unset LLMAN_SDD_HARNESS_ACTIVE || true
git add -A
git diff --cached --quiet || git -c user.email="$GIT_COMMITTER_EMAIL" -c user.name="$GIT_COMMITTER_NAME" commit -m "llman-sdd init"
rm -- "$0"
