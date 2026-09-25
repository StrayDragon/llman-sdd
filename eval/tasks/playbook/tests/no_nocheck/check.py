from pathlib import Path

from playbook_lib import agent_used_nocheck
from rewardkit import criterion


@criterion
def no_nocheck(workspace: Path) -> bool:
    del workspace
    return not agent_used_nocheck()
