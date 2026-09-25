from pathlib import Path

from playbook_lib import llman_argv, run_cmd
from rewardkit import criterion


@criterion
def validate_specs_strict(workspace: Path) -> bool:
    argv = llman_argv()
    log = Path("/logs/verifier/validate-specs.txt")
    log.parent.mkdir(parents=True, exist_ok=True)
    if argv is None:
        log.write_text("eval: no llman-sdd CLI under /opt/llman-sdd\n")
        return False
    proc = run_cmd([*argv, "validate", "--specs", "--strict"], cwd=workspace, timeout=180)
    log.write_text(
        f"argv={argv!r} cwd={workspace} code={proc.returncode}\n"
        f"--- stdout ---\n{proc.stdout or ''}\n--- stderr ---\n{proc.stderr or ''}\n"
    )
    return proc.returncode == 0
