"""Skill 文风观测断言(eval-playbook r98):恒真观测维度,不作为通过门槛。

统计容器内 /app/.agents/skills/**/SKILL.md 的
  - 强度词表外词形(禁止/勿/不要/应/建议/务必/尽量/最好…,init-generators r97 四级表之外)
  - 直角引号「」计数(r97 后应为 0)
写入 /logs/verifier/skill-style.txt 供 A/B 组间对比;返回恒 True。
"""
from pathlib import Path

from rewardkit import criterion

LOG = Path("/logs/verifier/skill-style.txt")
STRENGTH_EXTRA = ("禁止", "勿", "不要", "应当", "应该", "务必", "一定要", "尽量", "最好", "建议")
CORNER_QUOTES = ("「", "」")


def _count(text: str) -> tuple[int, int]:
    strength = sum(text.count(w) for w in STRENGTH_EXTRA)
    quotes = sum(text.count(q) for q in CORNER_QUOTES)
    return strength, quotes


@criterion
def skill_style(workspace: Path) -> bool:
    del workspace  # 观测 /app 固定路径,不依赖 trial workspace
    rows: list[str] = []
    total_s = total_q = files = 0
    for skill in sorted(Path("/app/.agents/skills").glob("*/SKILL.md")):
        text = skill.read_text(encoding="utf-8")
        s, q = _count(text)
        files += 1
        total_s += s
        total_q += q
        rows.append(f"{skill.parent.name}: strength-extra={s} corner-quotes={q}")
    rows.append(f"TOTAL files={files} strength-extra={total_s} corner-quotes={total_q}")
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text("\n".join(rows) + "\n")
    return True  # 恒真:观测维度,不阻断 reward(all-pass 语义不变)
