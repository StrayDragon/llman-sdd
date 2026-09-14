// Liveness golden for the peripheral command surface: run v1 (`llman sdd …`)
// and v2 (`apps/cli …`) against THIS repo and compare normalized structures.
// Normalization: relative times → <REL>, ISO timestamps → <TS>, dates →
// <DATE>, whitespace runs → single space (human tables), advisory `hint`
// strings dropped from gateChecks, JSON compared structurally.
// Requires `llman` (v1) on PATH. Run: bun run golden:cli
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const V2_CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

const COMMANDS: { name: string; v1: string[]; v2: string[]; json: boolean }[] = [
  { name: 'list', v1: ['sdd', 'list'], v2: ['list'], json: false },
  { name: 'list --json', v1: ['sdd', 'list', '--json'], v2: ['list', '--json'], json: true },
  { name: 'list --specs', v1: ['sdd', 'list', '--specs'], v2: ['list', '--specs'], json: false },
  {
    name: 'list --specs --json',
    v1: ['sdd', 'list', '--specs', '--json'],
    v2: ['list', '--specs', '--json'],
    json: true,
  },
  {
    name: 'graph',
    v1: ['sdd', 'graph', '--format', 'mermaid'],
    v2: ['graph', '--format', 'mermaid'],
    json: false,
  },
  {
    name: 'show change json',
    v1: ['sdd', 'show', 'port-review-freeze-context', '--output', 'json', '--type', 'change'],
    v2: ['show', 'port-review-freeze-context', '--output', 'json'],
    json: true,
  },
  {
    name: 'show spec',
    v1: ['sdd', 'show', 'validation', '--type', 'spec'],
    v2: ['show', 'validation', '--type', 'spec'],
    json: false,
  },
  {
    name: 'next-req-id',
    v1: ['sdd', 'spec', 'next-req-id'],
    v2: ['spec', 'next-req-id'],
    json: false,
  },
];

function normalizeText(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trim().replaceAll(/\s+/gu, ' '))
    .filter((l) => l !== '' && !l.startsWith('INFO:'))
    .join('\n')
    .replaceAll(/\b\d+[smhd]\s+ago\b/gu, '<REL>')
    .replace('just now', '<REL>')
    .replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/gu, '<TS>')
    .replaceAll(/\d{4}-\d{2}-\d{2}/gu, '<DATE>');
}

function normalizeJson(v: unknown): unknown {
  if (typeof v === 'string') {
    return v
      .replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/gu, '<TS>')
      .replaceAll(/\d{4}-\d{2}-\d{2}/gu, '<DATE>');
  }
  if (Array.isArray(v)) return v.map(normalizeJson);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      // advisory gate hints are wording-level, not contract
      if (k === 'hint') continue;
      out[k] = normalizeJson(val);
    }
    return out;
  }
  return v;
}

function run(cmd: string, args: string[]): string {
  const proc = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return proc.stdout ?? '';
}

let failures = 0;
for (const c of COMMANDS) {
  const v1 = run('llman', c.v1);
  const v2 = run('bun', [V2_CLI, ...c.v2]);
  let equal: boolean;
  if (c.json) {
    try {
      equal =
        JSON.stringify(normalizeJson(JSON.parse(v1))) ===
        JSON.stringify(normalizeJson(JSON.parse(v2)));
    } catch {
      equal = false;
    }
  } else {
    const a = normalizeText(v1);
    const b = normalizeText(v2);
    // mermaid 节点/边的输出顺序对语义无影响,v1 的 archived 排序口径不外显——排序后对比
    equal =
      c.name === 'graph'
        ? a.split('\n').toSorted().join('\n') === b.split('\n').toSorted().join('\n')
        : a === b;
  }
  if (!equal) {
    failures += 1;
    console.error(`[drift] ${c.name}\n--- v1\n${v1.slice(0, 400)}\n--- v2\n${v2.slice(0, 400)}`);
  } else {
    console.log(`ok ${c.name}`);
  }
}
if (failures > 0) process.exit(1);
console.log(`cli golden passed: ${COMMANDS.length} commands match v1`);
