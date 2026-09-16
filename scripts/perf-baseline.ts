import { spawnSync } from 'node:child_process';
/**
 * Performance baseline for the v2 CLI (acceptance design, T5).
 *
 * Generates a synthetic specs fixture (default 60 capabilities × 3 reqs ×
 * 2 scenarios) in a temp project, then times the read-path commands through
 * the real CLI subprocess. `context` runs in its model-unset guard path (no
 * network) — real-LLM latency is measured by `just smoke-context` instead.
 *
 * Usage: bun scripts/perf-baseline.ts [caps=60] [runs=3]
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

const caps = Number(process.argv[2] ?? 60);
const runs = Number(process.argv[3] ?? 3);

function specSource(i: number): string {
  const reqs: string[] = [];
  for (let r = 1; r <= 3; r += 1) {
    const id = `r${i * 10 + r}`;
    reqs.push(
      `  @req:${id} @human\n  场景: 规则 ${i}-${r}\n    - 系统 MUST 提供能力 ${i} 的第 ${r} 条行为。\n`,
      `  @req:${id} @executable\n  场景: 验收 ${i}-${r}\n    假如 初始状态 ${i}-${r}\n    当 执行动作\n    那么 得到结果\n`,
    );
  }
  return `# language: zh-CN
# capability: cap-${i}
# purpose: 性能基线夹具能力 ${i}
# scope: llmanspec/

功能: cap-${i}

${reqs.join('\n')}`;
}

const fixture = mkdtempSync(join(tmpdir(), 'llman-sdd-perf-'));
mkdirSync(join(fixture, 'llmanspec', 'specs'), { recursive: true });
writeFileSync(join(fixture, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
for (let i = 1; i <= caps; i += 1) {
  writeFileSync(join(fixture, 'llmanspec', 'specs', `cap-${i}.feature`), specSource(i));
}

const OPS: { name: string; args: string[]; env?: Record<string, string> }[] = [
  { name: 'validate --specs --no-check', args: ['validate', '--specs', '--no-check'] },
  { name: 'index rebuild', args: ['index', 'rebuild'] },
  { name: 'index check', args: ['index', 'check'] },
  { name: 'list --specs --json', args: ['list', '--specs', '--json'] },
  {
    // context 的免 LLM 路径:未设 model 时走 unavailable 守卫(r27)
    name: 'context (model-unset guard)',
    args: ['context', '--task', '性能基线探针'],
    env: { LLMAN_SDD_INDEX_CHAT_MODEL: '' },
  },
];

const timings: { name: string; samples: number[] }[] = [];
for (const op of OPS) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
  );
  if (op.name.startsWith('context')) delete env.LLMAN_SDD_INDEX_CHAT_MODEL;
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const started = Date.now();
    const proc = spawnSync('bun', [CLI, ...op.args], { cwd: fixture, encoding: 'utf8', env });
    const ms = Date.now() - started;
    if ((proc.status ?? 1) !== 0 && op.name !== 'context (model-unset guard)') {
      console.error(`op failed: ${op.name}\n${proc.stdout}${proc.stderr}`);
      rmSync(fixture, { recursive: true, force: true });
      process.exit(1);
    }
    samples.push(ms);
  }
  timings.push({ name: op.name, samples });
}

rmSync(fixture, { recursive: true, force: true });

const row = (name: string, samples: number[]): string => {
  const mean = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  const min = Math.min(...samples);
  return `${name.padEnd(30)} mean ${String(mean).padStart(6)}ms   min ${String(min).padStart(6)}ms   runs ${samples.join('/')}`;
};

console.log(`# perf baseline — fixture: ${caps} caps × 3 reqs × 2 scenarios, bun subprocess`);
for (const t of timings) console.log(row(t.name, t.samples));
