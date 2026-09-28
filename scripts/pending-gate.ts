#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
// unbound 计量门(阶段性 QA):未绑定需求(无 runnable 嵌套场景的规则,
// @skip/@experimental-only 或 stepless 亦计入)数不得高于基线。
// 绑定化批次(finalize 时)只许下调 scripts/pending-baseline.json;
// 新增 MUST 规则必须按 init-generators r66 分流判据配对可运行场景或书面记录不可执行理由。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const run = spawnSync(
  'bun',
  [join(root, 'apps', 'cli', 'src', 'main.ts'), 'list', '--specs', '--json'],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
if (run.status !== 0) {
  console.error(`pending-gate: list --specs --json failed\n${run.stderr ?? ''}`);
  process.exit(1);
}
const specs: Array<{ id: string; morphology?: { requirementUnboundCount?: number } }> = JSON.parse(
  run.stdout!,
);
const pending = specs.reduce((n, s) => n + (s.morphology?.requirementUnboundCount ?? 0), 0);
const { maxPending } = JSON.parse(
  readFileSync(join(root, 'scripts', 'pending-baseline.json'), 'utf8'),
) as {
  maxPending: number;
};
console.log(`pending-gate: ${pending} unbound requirement(s), baseline max ${maxPending}`);
if (pending > maxPending) {
  console.error(
    `pending-gate FAILED: ${pending} > ${maxPending} — ` +
      'new MUST requirements MUST pair a runnable nested 场景: (r90/r12) or lower the baseline with justification',
  );
  process.exit(1);
}
