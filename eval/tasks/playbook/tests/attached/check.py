from pathlib import Path

from playbook_lib import archived_proposals, archive_want, proposal_has_branch
from rewardkit import criterion


@criterion
def attached(workspace: Path) -> bool:
    want = archive_want()
    with_branch = [p for p in archived_proposals(workspace) if proposal_has_branch(p)]
    return len(with_branch) >= want
