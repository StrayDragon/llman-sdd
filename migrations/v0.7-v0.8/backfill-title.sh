#!/usr/bin/env bash
# v0.7 → v0.8 一次性迁移:为活跃 change 的 proposal.md frontmatter 补写非空 title。
# 幂等——已有非空 title 的 change 跳过。取值优先正文 H1,无 H1 用 TODO 占位。
# 用法:在本仓库根(含 lllmanspec/ 或 llmanspec/)执行  bash migrations/v0.7-v0.8/backfill-title.sh
set -euo pipefail

ROOT="${1:-$(pwd)}"
CHANGES="$ROOT/llmanspec/changes"
[ -d "$CHANGES" ] || { echo "no llmanspec/changes at $ROOT"; exit 1; }

python3 - "$CHANGES" <<'PY'
import re
import sys
from pathlib import Path

changes = Path(sys.argv[1])
patched, skipped = [], []
for proposal in sorted(changes.glob('*/proposal.md')):
    if 'archive' in proposal.relative_to(changes).parts:
        continue
    text = proposal.read_text()
    m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not m:
        skipped.append((proposal.parent.name, 'no frontmatter block'))
        continue
    fm = m.group(1)
    title_m = re.search(r'^title:\s*(.+)$', fm, re.M)
    if title_m and title_m.group(1).strip().strip('"\'') != '':
        skipped.append((proposal.parent.name, 'title already set'))
        continue
    h1 = re.search(r'^# (.+)$', text, re.M)
    title = (h1.group(1).strip() if h1 else 'TODO')
    new_fm = f'title: {title}\n{fm}' if fm else f'title: {title}\n'
    proposal.write_text(text.replace(m.group(0), f'---\n{new_fm}\n---\n', 1))
    patched.append((proposal.parent.name, title))

for name, title in patched:
    print(f'[backfill] {name}: title: {title}')
for name, why in skipped:
    print(f'[skip] {name}: {why}')
print(f'done: {len(patched)} backfilled, {len(skipped)} skipped')
PY
