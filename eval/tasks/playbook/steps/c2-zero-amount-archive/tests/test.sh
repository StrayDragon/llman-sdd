#!/bin/bash
set -euo pipefail
export EVAL_STEP=c2-zero-amount-archive
exec bash /tests/grade.sh
