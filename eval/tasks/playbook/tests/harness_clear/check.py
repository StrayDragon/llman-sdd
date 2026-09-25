import os
from pathlib import Path

from rewardkit import criterion


@criterion
def harness_clear(workspace: Path) -> bool:
    del workspace
    os.environ.pop("LLMAN_SDD_HARNESS_ACTIVE", None)
    return not os.environ.get("LLMAN_SDD_HARNESS_ACTIVE")
