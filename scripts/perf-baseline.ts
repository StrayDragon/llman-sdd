import { spawnSync } from 'node:child_process';
/**
 * Performance smoke baseline for the CLI (acceptance design, T5).
 *
 * Generates a synthetic NATIVE-format specs fixture (default 60 capabilities ×
 * 3 rules × 1 runnable scenario) in a temp project, then times the read-path
 * commands through the real CLI subprocess. `context` runs in its model-unset
 * guard path (no network) — real-LLM latency is measured by `just
 * smoke-context` instead.
 *
 * This is a REGRESSION SMOKE, not a precise benchmark: it catches
 * order-of-magnitude regressions (accidental O(n^2) parsing, runaway I/O),
 * not ±30% wobble. Ceilings are deliberately generous and tuned for
 * dev-grade machines (see CEILING_MS); bump them if your box is slower — but
 * keep the ratios honest.
 *
 * Usage:
 *   bun scripts/perf-baseline.ts [caps=60] [runs=3]          # reference timings
 *   bun scripts/perf-baseline.ts [caps=60] [runs=3] --check  # gate: any mean > ceiling → exit 1
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const cleanArgs = args.filter((a) => a !== '--check');
const caps = Number(cleanArgs[0] ?? 60);
const runs = Number(cleanArgs[1] ?? 3);

/**
 * Order-of-magnitude regression ceilings (mean ms per op, `--check` mode).
 * Calibrated 2026-10-07 against local runs at the default fixture (60 caps ×
 * 3 runs): validate mean ~333ms, all other read ops < 70ms. Ceilings allow
 * roughly 15× headroom on purpose — the gate exists to catch accidental O(n^2)
 * parsing or runaway I/O, not benchmark wobble. They are fixture-size blind:
 * smaller fixtures stay far below, larger ones still get the gross-regression
 * guard. Bump only if your dev machine is an order of magnitude slower.
 */
const CEILING_MS: Record<string, number> = {
  'validate --specs --no-check': 5_000,
  'index rebuild': 2_000,
  'index check': 1_000,
  'list --specs --json': 2_000,
  'context (model-unset guard)': 2_000,
};

function specSource(i: number): string {
  const rules: string[] = [];
  for (let r = 1; r <= 3; r += 1) {
    const id = `r${i * 10 + r}`;
    rules.push(
      `  @req:${id}\n  规则: 能力 ${i} 的第 ${r} 条行为\n    需求描述:系统 MUST 提供能力 ${i} 的第 ${r} 条行为。\n\n    场景: 验收 ${i}-${r}\n      假如 初始状态 ${i}-${r}\n      当 执行动作\n      那么 得到结果\n`,
    );
  }
  return `# language: zh-CN
# capability: cap-${i}
# purpose: 性能冒烟夹具能力 ${i}
# scope: llmanspec/

功能: cap-${i}

${rules.join('\n')}`;
}

const fixture = mkdtempSync(join(tmpdir(), 'llman-sdd-perf-'));
mkdirSync(join(fixture, 'llmanspec', 'specs'), { recursive: true });
writeFileSync(join(fixture, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
for (let i = 1; i <= caps; i += 1) {
  writeFileSync(join(fixture, 'llmanspec', 'specs', `cap-${i}.feature`), specSource(i));
}

const OPS: { name: string; args: string[] }[] = [
  { name: 'validate --specs --no-check', args: ['validate', '--specs', '--no-check'] },
  { name: 'index rebuild', args: ['index', 'rebuild'] },
  { name: 'index check', args: ['index', 'check'] },
  { name: 'list --specs --json', args: ['list', '--specs', '--json'] },
  {
    // context 的免 LLM 路径:未设 model 时走 unavailable 守卫(r27)
    name: 'context (model-unset guard)',
    args: ['context', '--task', '性能基线探针'],
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

console.log(`# perf baseline — fixture: ${caps} caps × 3 rules × 1 scenario, bun subprocess`);
for (const t of timings) console.log(row(t.name, t.samples));

if (checkMode) {
  const failures: string[] = [];
  for (const t of timings) {
    const mean = Math.round(t.samples.reduce((a, b) => a + b, 0) / t.samples.length);
    const ceiling = CEILING_MS[t.name];
    if (ceiling === undefined) {
      failures.push(`${t.name}: no ceiling registered`);
    } else if (mean > ceiling) {
      failures.push(`${t.name}: mean ${mean}ms > ceiling ${ceiling}ms`);
    }
  }
  if (failures.length > 0) {
    console.error(`check-perf FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('check-perf OK: all ops within order-of-magnitude ceilings');
}
