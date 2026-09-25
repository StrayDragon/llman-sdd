from pathlib import Path

from playbook_lib import run_cmd
from rewardkit import criterion


@criterion
def demo_behavior(workspace: Path) -> bool:
    proc = run_cmd(["bun", "src/main.ts", "1000", "15"], cwd=workspace, timeout=30)
    return proc.returncode == 0 and (proc.stdout or "").strip() == "150"
