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

const COMMANDS: {
  name: string;
  v1: string[];
  v2: string[];
  json: boolean;
  /** extra commands run before the captured pair (per tool, same split) */
  pre?: { v1: string[]; v2: string[] }[];
  /** commands interleaved immediately before each tool's own capture */
  pre1?: string[][];
  pre2?: string[][];
}[] = [
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
    v1: ['sdd', 'show', 'release-v2-and-cutover', '--output', 'json', '--type', 'change'],
    v2: ['show', 'release-v2-and-cutover', '--output', 'json'],
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
  { name: 'review', v1: ['sdd', 'review'], v2: ['review'], json: false },
  { name: 'review --json', v1: ['sdd', 'review', '--json'], v2: ['review', '--json'], json: true },
  // index: 每个工具独立 rebuild → check 序列(哈希算法 v1/v2 不必一致,归一化后比输出形状)
  { name: 'index rebuild', v1: ['sdd', 'index', 'rebuild'], v2: ['index', 'rebuild'], json: false },
  {
    name: 'index check',
    v1: ['sdd', 'index', 'check'],
    v2: ['index', 'check'],
    json: false,
    // 各自的 rebuild 必须紧贴各自的 check(后写的哈希会覆盖前者)
    pre1: [['sdd', 'index', 'rebuild']],
    pre2: [['index', 'rebuild']],
  },
];

function normalizeText(s: string): string {
  return (
    s
      .split('\n')
      .map((l) => l.trim().replaceAll(/\s+/gu, ' '))
      .filter((l) => l !== '' && !l.startsWith('INFO:'))
      .join('\n')
      .replaceAll(/\b\d+[smhd]\s+ago\b/gu, '<REL>')
      .replace('just now', '<REL>')
      .replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/gu, '<TS>')
      .replaceAll(/\d{4}-\d{2}-\d{2}/gu, '<DATE>')
      .replaceAll(/^stale: \S+ \(\d+\)$/gm, 'stale: <CAP> (<N>)')
      .replaceAll(/^- (INFO|DEFERRED|OK)$/gm, '  - <STALE>')
      .replaceAll(/^Error: review found \d+ CRITICAL finding\(s\).*$/gm, '')
      .replaceAll(/\(built [^,]+,/gu, '(built <TS>,')
      .replaceAll('chat model: <unset>', 'chat model: <MODEL>')
      .replaceAll('chat_model=<unset>', 'chat_model=<MODEL>')
      // replacements above can leave empty lines (e.g. stripped Error lines)
      .split('\n')
      .filter((l) => l !== '')
      .join('\n')
  );
}

function normalizeJson(v: unknown, staleSignal = false): unknown {
  if (typeof v === 'string') {
    // v2 的 stale 信号为占位(detail=DEFERRED),v1 为 staleness 状态字——归一化排除
    if (staleSignal) return '<STALE>';
    return v
      .replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/gu, '<TS>')
      .replaceAll(/\d{4}-\d{2}-\d{2}/gu, '<DATE>');
  }
  if (Array.isArray(v)) return v.map((item) => normalizeJson(item, staleSignal));
  if (v !== null && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const isStaleSignal = obj['kind'] === 'stale';
    for (const [k, val] of Object.entries(obj)) {
      // advisory gate hints are wording-level, not contract
      if (k === 'hint') continue;
      out[k] = normalizeJson(val, isStaleSignal);
    }
    return out;
  }
  return v;
}

function run(cmd: string, args: string[]): string {
  // v1 prints progress lines to stderr and results to stdout — capture both.
  const proc = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`;
}

/** Extract the outermost JSON value (object or array) from mixed capture. */
function extractJson(out: string): unknown {
  const text = `${out}\n`;
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  const useArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  if (useArray) return JSON.parse(text.slice(arrStart, text.lastIndexOf(']') + 1));
  return JSON.parse(text.slice(objStart, text.lastIndexOf('}') + 1));
}

let failures = 0;
for (const c of COMMANDS) {
  for (const pre of c.pre ?? []) {
    run('llman', pre.v1);
    run('bun', [V2_CLI, ...pre.v2]);
  }
  for (const pre of c.pre1 ?? []) run('llman', pre);
  const v1 = run('llman', c.v1);
  for (const pre of c.pre2 ?? []) run('bun', [V2_CLI, ...pre]);
  const v2 = run('bun', [V2_CLI, ...c.v2]);
  let equal: boolean;
  if (c.json) {
    try {
      equal =
        JSON.stringify(normalizeJson(extractJson(v1))) ===
        JSON.stringify(normalizeJson(extractJson(v2)));
    } catch {
      equal = false;
    }
  } else {
    const a = normalizeText(v1);
    const b = normalizeText(v2);
    // 行序在 v1/v2 间是表现层(stderr/stdout 交错、archived 目录序)——集合一致即合同一致
    equal = a.split('\n').toSorted().join('\n') === b.split('\n').toSorted().join('\n');
  }
  if (!equal) {
    failures += 1;
    const na = normalizeText(v1).split('\n').toSorted();
    const nb = normalizeText(v2).split('\n').toSorted();
    console.error(`[drift] ${c.name}\n${JSON.stringify({ v1: na, v2: nb }, null, 1)}`);
  } else {
    console.log(`ok ${c.name}`);
  }
}
if (failures > 0) process.exit(1);
console.log(`cli golden passed: ${COMMANDS.length} commands match v1`);
