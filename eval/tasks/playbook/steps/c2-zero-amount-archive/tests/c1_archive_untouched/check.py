from pathlib import Path

from playbook_lib import archive_hashes, run_cmd
from rewardkit import criterion


@criterion
def c1_archive_untouched(workspace: Path) -> bool:
    hashes = archive_hashes(workspace)
    if not hashes:
        return False
    first = hashes[0]
    proc = run_cmd(["git", "merge-base", "--is-ancestor", first, "HEAD"], cwd=workspace)
    return proc.returncode == 0
