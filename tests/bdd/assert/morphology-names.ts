// r90 morphology 计量字段命名对账(只读断言,退出码即判定)。
// list --specs 与 show <spec> 两面 MUST 产出 requirement 系字段,且不再产出历史 rule* 系字段。
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..', '..');
const runCli = (args: string[]): unknown => {
  const run = spawnSync('bun', [join(root, 'apps', 'cli', 'src', 'main.ts'), ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (run.status !== 0) {
    console.error(`morphology-names: CLI failed (${args.join(' ')})\n${run.stderr ?? ''}`);
    process.exit(1);
  }
  return JSON.parse(run.stdout!) as Record<string, unknown>;
};

const assertMorphology = (morphology: unknown, source: string): void => {
  const m = (morphology ?? {}) as Record<string, unknown>;
  for (const key of ['requirementBoundCount', 'requirementUnboundCount']) {
    if (typeof m[key] !== 'number') fail(`${source} 缺 requirement 系字段 ${key}`);
  }
  for (const legacy of ['ruleEnforcedCount', 'rulePendingCount']) {
    if (legacy in m) fail(`${source} 仍产出历史字段 ${legacy}`);
  }
};

const fail = (message: string): never => {
  console.error(`morphology-names: ${message}`);
  process.exit(1);
};

const specs = runCli(['list', '--specs', '--json']) as Array<{ morphology?: unknown }>;
if (!Array.isArray(specs) || specs.length === 0) fail('list --specs --json 返回空');
for (const s of specs) assertMorphology(s.morphology, 'list --specs');

const first = (specs[0] ?? {}) as { id?: string };
const shown = runCli(['show', first.id ?? '', '--output', 'json', '--type', 'spec']) as Record<
  string,
  unknown
>;
assertMorphology(shown.morphology, `show ${String(first.id)}`);

console.log('morphology-names: r90 contract ok');
