from pathlib import Path

from playbook_lib import archive_hashes, archive_want
from rewardkit import criterion


@criterion
def archive_once(workspace: Path) -> bool:
    return len(archive_hashes(workspace)) == archive_want()
