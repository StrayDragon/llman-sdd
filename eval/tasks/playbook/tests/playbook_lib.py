"""Shared helpers for playbook Reward Kit criteria. No @criterion here (ignored by discovery)."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

LOG_AGENT = Path("/logs/agent")
STEP_C2 = "c2-zero-amount-archive"
TOOL_ARG_KEYS = ("command", "cmd", "script", "code", "bash", "input")
BRANCH_RE = re.compile(r"^branch:\s+\S", re.MULTILINE)


def eval_step() -> str:
    return os.environ.get("EVAL_STEP", "c1-tip-integer-archive")


def archive_want() -> int:
    return 2 if eval_step() == STEP_C2 else 1


def llman_argv() -> list[str] | None:
    src = Path("/opt/llman-sdd/apps/cli/src/main.ts")
    dist = Path("/opt/llman-sdd/apps/cli/dist/llman-sdd")
    if src.is_file():
        return ["bun", str(src)]
    if dist.is_file() and os.access(dist, os.X_OK):
        return [str(dist)]
    return None


def run_cmd(
    argv: list[str],
    *,
    cwd: Path,
    timeout: int = 120,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    merged = os.environ.copy()
    merged.pop("LLMAN_SDD_HARNESS_ACTIVE", None)
    if env:
        merged.update(env)
    return subprocess.run(
        argv,
        cwd=cwd,
        env=merged,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def git(workspace: Path, args: list[str], timeout: int = 30) -> str:
    proc = run_cmd(["git", *args], cwd=workspace, timeout=timeout)
    if proc.returncode != 0:
        return ""
    return (proc.stdout or "").strip()


def archive_hashes(workspace: Path) -> list[str]:
    text = git(
        workspace,
        ["log", "--reverse", "--all", "--grep=archive(sdd):", "--pretty=%H"],
    )
    return [line for line in text.splitlines() if line.strip()]


def default_branch(workspace: Path) -> str:
    origin = git(workspace, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])
    if origin:
        return origin.rsplit("/", 1)[-1]
    for name in ("main", "master"):
        if git(workspace, ["rev-parse", "--verify", name]):
            return name
    current = git(workspace, ["rev-parse", "--abbrev-ref", "HEAD"])
    return current or "HEAD"


def proposal_has_branch(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.startswith("---"):
        return False
    parts = text.split("---", 2)
    if len(parts) < 3:
        return False
    return BRANCH_RE.search(parts[1]) is not None


def archived_proposals(workspace: Path) -> list[Path]:
    root = workspace / "llmanspec" / "changes" / "archive"
    if not root.is_dir():
        return []
    return sorted(root.glob("*/proposal.md"))


def _tool_call_blob(item: object) -> str:
    if not isinstance(item, dict):
        return ""
    kind = str(item.get("type") or item.get("role") or "")
    if kind not in {"toolCall", "tool_use", "functionCall", "function"}:
        return ""
    args = item.get("arguments") or item.get("input") or item.get("params")
    if isinstance(args, str):
        return args
    if not isinstance(args, dict):
        return json.dumps(item.get("name") or "")
    chunks: list[str] = []
    for key in TOOL_ARG_KEYS:
        value = args.get(key)
        if isinstance(value, str):
            chunks.append(value)
    return "\n".join(chunks)


def _walk_for_tool_calls(node: object, out: list[str]) -> None:
    if isinstance(node, dict):
        blob = _tool_call_blob(node)
        if blob:
            out.append(blob)
        message = node.get("message")
        if isinstance(message, dict):
            _walk_for_tool_calls(message.get("content"), out)
        for value in node.values():
            _walk_for_tool_calls(value, out)
    elif isinstance(node, list):
        for item in node:
            _walk_for_tool_calls(item, out)


def agent_used_nocheck(logs_root: Path = LOG_AGENT) -> bool:
    """True when an agent tool invocation's command args contain --no-check.

    Reads /logs/agent JSONL toolCall arguments only — not tool results or skill text.
    """
    if not logs_root.is_dir():
        return False
    for path in logs_root.rglob("*.jsonl"):
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            blobs: list[str] = []
            _walk_for_tool_calls(payload, blobs)
            if any("--no-check" in blob for blob in blobs):
                return True
    return False
