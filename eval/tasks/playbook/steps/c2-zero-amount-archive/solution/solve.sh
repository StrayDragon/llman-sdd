#!/bin/bash
set -euo pipefail
cd /app
if [ -f /opt/llman-sdd/apps/cli/src/main.ts ]; then
  LLMAN="bun /opt/llman-sdd/apps/cli/src/main.ts"
elif [ -x /opt/llman-sdd/apps/cli/dist/llman-sdd ]; then
  LLMAN=/opt/llman-sdd/apps/cli/dist/llman-sdd
else
  echo "eval: no llman-sdd CLI under /opt/llman-sdd" >&2
  exit 1
fi
unset LLMAN_SDD_HARNESS_ACTIVE || true
id=$($LLMAN change new --from "zero amount prints zero" --dry-run | tail -n 1 | tr -d '[:space:]')
$LLMAN change new --from "zero amount prints zero"
cat > "llmanspec/changes/${id}/design.md" <<'MD'
# design
Oracle C2.
MD
cat > "llmanspec/changes/${id}/tasks.md" <<'MD'
# tasks
- [x] T1: specs
MD
git add -A
git diff --cached --quiet || git commit -m "draft C2"
if [ -n "$(git status --porcelain)" ]; then
  echo "eval oracle: dirty tree before change start:" >&2
  git status --porcelain >&2
  exit 1
fi
$LLMAN change start "$id"
cat >> llmanspec/specs/tip-output.feature <<'FEAT'

  @req:r2 @human
  场景: 零金额
    - 当金额参数为 0 时 CLI MUST 打印 0 且 exit 0。
  @req:r2 @executable
  场景: 0 的 15%
    假如 工作目录是仓库根
    当 执行命令 "bun src/main.ts 0 15"
    那么 退出码为 0
FEAT
git add llmanspec
git commit -m "feat(sdd): land zero-amount spec"
$LLMAN change finalize "$id"
