from pathlib import Path

from playbook_lib import default_branch, git
from rewardkit import criterion


@criterion
def not_default_branch_specs(workspace: Path) -> bool:
    branch = default_branch(workspace)
    log = git(
        workspace,
        ["log", "--first-parent", branch, "--pretty=%s", "--", "llmanspec/specs"],
    )
    subjects = [line.strip() for line in log.splitlines() if line.strip()]
    if not any(line.startswith("archive(sdd):") for line in subjects):
        return False

    def ok(line: str) -> bool:
        return line.startswith("archive(sdd):") or line in {"llman-sdd init", "seed"}

    return all(ok(line) for line in subjects)
