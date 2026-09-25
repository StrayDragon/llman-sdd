#!/bin/bash
set -euo pipefail
STEP="${EVAL_STEP:-c1-tip-integer-archive}"
cd /app
unset LLMAN_SDD_HARNESS_ACTIVE || true
fail=0
note() { echo "$1" >&2; }

if [ -z "${LLMAN_SDD_HARNESS_ACTIVE:-}" ]; then
  harness=1
else
  harness=0
  fail=1
  note "harness_clear: LLMAN_SDD_HARNESS_ACTIVE is set"
fi

if test -f .agents/skills/llman-sdd-explore/SKILL.md; then
  skills=1
else
  skills=0
  fail=1
  note "skills_present: missing skill file"
fi

if [ -f /opt/llman-sdd/apps/cli/src/main.ts ]; then
  LLMAN="bun /opt/llman-sdd/apps/cli/src/main.ts"
elif [ -x /opt/llman-sdd/apps/cli/dist/llman-sdd ]; then
  LLMAN=/opt/llman-sdd/apps/cli/dist/llman-sdd
else
  echo "eval: no llman-sdd CLI under /opt/llman-sdd" >&2
  fail=1
fi

set +e
$LLMAN validate --specs --strict >/tmp/validate-specs.txt 2>&1
val=$?
set -e
if [ "$val" -eq 0 ]; then
  validate_specs=1
else
  validate_specs=0
  fail=1
  note "validate_specs_strict failed"
  cat /tmp/validate-specs.txt >&2 || true
fi

archives=$(git log --all --grep='archive(sdd):' --pretty=%H | wc -l | tr -d ' ')
want=1
if [ "$STEP" = "c2-zero-amount-archive" ]; then want=2; fi
if [ "$archives" -eq "$want" ]; then
  archive_ok=1
else
  archive_ok=0
  fail=1
  note "archive_once: got $archives want $want"
fi

set +e
out=$(bun src/main.ts 1000 15 2>/dev/null)
demo1=$?
set -e
if [ "$out" = "150" ] && [ "$demo1" -eq 0 ]; then
  demo_ok=1
else
  demo_ok=0
  fail=1
  note "demo_behavior 1000 15: got '$out' code $demo1"
fi

zero_ok=1
if [ "$STEP" = "c2-zero-amount-archive" ]; then
  set +e
  z=$(bun src/main.ts 0 15 2>/dev/null)
  zc=$?
  set -e
  if [ "$z" = "0" ] && [ "$zc" -eq 0 ]; then
    zero_ok=1
  else
    zero_ok=0
    fail=1
    note "demo_behavior 0 15: got '$z' code $zc"
  fi
fi

mkdir -p /logs/verifier
python3 - <<PY
import json
from pathlib import Path
reward = {
  "skills_present": ${skills},
  "harness_clear": ${harness},
  "validate_specs_strict": ${validate_specs},
  "archive_once": ${archive_ok},
  "demo_behavior": ${demo_ok},
  "zero_behavior": ${zero_ok},
}
ok = all(v == 1 for v in reward.values())
reward["reward"] = 1 if ok else 0
Path("/logs/verifier/reward.json").write_text(json.dumps(reward) + "\n")
Path("/logs/verifier/reward.txt").write_text("1\n" if ok else "0\n")
PY
exit "$fail"
