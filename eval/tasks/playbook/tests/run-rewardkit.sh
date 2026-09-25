#!/bin/bash
# Preinstalled in the eval image: uvx/PyPI are blocked by Harbor allowlist at verify time.
set -euo pipefail
export PATH="/root/.local/bin:/root/.bun/bin:${PATH:-}"
export PYTHONPATH="/tests${PYTHONPATH:+:$PYTHONPATH}"
export LITELLM_LOCAL_MODEL_COST_MAP="${LITELLM_LOCAL_MODEL_COST_MAP:-True}"
mkdir -p /logs/verifier
REWARDKIT="/root/.local/bin/rewardkit"
if [ ! -x "$REWARDKIT" ]; then
  REWARDKIT="$(command -v rewardkit)"
fi
exec "$REWARDKIT" /tests
