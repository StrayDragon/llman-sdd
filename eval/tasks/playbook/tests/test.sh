#!/bin/bash
set -euo pipefail
export EVAL_STEP="${EVAL_STEP:-c1-tip-integer-archive}"
exec bash /tests/run-rewardkit.sh
