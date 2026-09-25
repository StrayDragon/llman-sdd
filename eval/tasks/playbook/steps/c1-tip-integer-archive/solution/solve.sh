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
# Implement the tip CLI first so bun test (bdd.run_command) can pass.
cat > src/main.ts <<'TS'
const bill = Number(process.argv[2]);
const pct = Number(process.argv[3]);
if (!Number.isFinite(bill) || !Number.isFinite(pct)) {
  process.exit(1);
}
console.log(String(Math.round((bill * pct) / 100)));
TS
git add src/main.ts
git diff --cached --quiet || git commit -m "feat: integer tip stdout"
id=$($LLMAN change new --from "add integer tip stdout" --dry-run | tail -n 1 | tr -d '[:space:]')
$LLMAN change new --from "add integer tip stdout"
cat > "llmanspec/changes/${id}/design.md" <<'MD'
# design
Oracle C1.
MD
cat > "llmanspec/changes/${id}/tasks.md" <<'MD'
# tasks
- [x] T1: specs and implementation
MD
git add -A
git diff --cached --quiet || git commit -m "draft change plus tip impl"
if [ -n "$(git status --porcelain)" ]; then
  echo "eval oracle: dirty tree before change start:" >&2
  git status --porcelain >&2
  exit 1
fi
$LLMAN change start "$id"
$LLMAN spec skeleton tip-output --force
cat > llmanspec/specs/tip-output.feature <<'FEAT'
# language: zh-CN
# capability: tip-output
# purpose: 小费 CLI 打印整数分。
# scope: src/main.ts, tests/tip.test.ts
功能: tip-output
  @req:r1 @human
  场景: 整数分
    - 当输入账单与百分比时 CLI MUST 在 stdout 打印四舍五入的整数分且 exit 0。
  @req:r1 @executable
  场景: 1000 的 15%
    假如 工作目录是仓库根
    当 执行命令 "bun src/main.ts 1000 15"
    那么 退出码为 0
FEAT
git add llmanspec src
git commit -m "feat(sdd): land tip-output specs"
$LLMAN change finalize "$id"
