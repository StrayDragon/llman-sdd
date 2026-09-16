import { spawnSync } from 'node:child_process';
/**
 * TEMPORARY v1(Rust) behavior-parity matrix — runs before the dogfood cutover
 * and is removed together with the other v1 gates in the same change
 * (release-v2-and-cutover T5). Extends golden:cli beyond its 12 commands:
 * change lifecycle on fresh repos, fresh-init products (incl. the ruled
 * AGENTS.md managed-block divergence), freeze/thaw parameter combinations,
 * review --export-html, and context guard/error paths.
 *
 * Requires `llman` (v1) on PATH. Run: bun scripts/temp-parity-v1.ts
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { normalizeCliText, runCapture } from '../tests/golden/lib.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const V2_CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

let pass = 0;
let fail = 0;
const divergences: string[] = [];

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass += 1;
    console.log(`ok ${name}`);
  } else {
    fail += 1;
    divergences.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.error(`DRIFT ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function freshRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'llman-parity-'));
  const git = (args: string[]): void => {
    spawnSync('git', args, { cwd: root, stdio: 'ignore' });
  };
  git(['init', '-q', '-b', 'main']);
  return root;
}

function commitAll(root: string): void {
  spawnSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'i'], {
    cwd: root,
    stdio: 'ignore',
  });
}

const v2 = (args: string[], cwd = REPO_ROOT): string => runCapture(['bun', V2_CLI], args, cwd);
const v1 = (args: string[], cwd = REPO_ROOT): string => runCapture(['llman'], args, cwd);

// -- 1. change lifecycle on fresh repos (same seed, one tool per repo) -------
function lifecycleMatrix(): void {
  const derived: Record<string, string> = {};
  for (const tool of ['v1', 'v2'] as const) {
    const root = freshRepo();
    mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
    writeFileSync(
      join(root, 'llmanspec', 'specs', 's.feature'),
      '# language: zh-CN\n# capability: s\n# purpose: p\n# scope: llmanspec/\n\n功能: s\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n',
    );
    commitAll(root);
    const newArgs = ['change', 'new', '--from', 'add demo feature'];
    const newOut = tool === 'v1' ? v1(['sdd', ...newArgs], root) : v2(newArgs, root);
    const derivedLine = newOut.split('\n').find((l) => l.startsWith('derived change id: ')) ?? '';
    const id = derivedLine.replace('derived change id: ', '').trim();
    derived[tool] = id;
    check(
      `lifecycle ${tool} new derives id`,
      id.length > 0,
      derivedLine || (newOut.split('\n')[0] ?? ''),
    );
    commitAll(root); // start 的干净树门要求 new 的产物已提交
    const startArgs = ['change', 'start', id];
    const startOut = tool === 'v1' ? v1(['sdd', ...startArgs], root) : v2(startArgs, root);
    check(
      `lifecycle ${tool} start`,
      !/error|failed/i.test(startOut),
      startOut.split('\n')[0] ?? '',
    );
    // Structural convergence: same branch name + binding keys in frontmatter.
    const branch = spawnSync('git', ['branch', '--show-current'], {
      cwd: root,
      encoding: 'utf8',
    }).stdout.trim();
    check(`lifecycle ${tool} branch`, branch === `sdd/${id}`, branch);
    const proposal = readFileSync(join(root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
    check(
      `lifecycle ${tool} binding keys`,
      proposal.includes('branch: sdd/') && proposal.includes('base_branch: main'),
    );
  }
  check('lifecycle derived id parity', derived['v1'] === derived['v2'], JSON.stringify(derived));
  // Argument contract: passing both <id> and --from must error on both tools.
  const bothArgs = (tool: 'v1' | 'v2'): { code: number; out: string } => {
    const root = freshRepo();
    mkdirSync(join(root, 'llmanspec'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
    commitAll(root);
    const args = ['change', 'new', 'demo-change', '--from', 'x'];
    const full = tool === 'v1' ? ['sdd', ...args] : args;
    const proc = spawnSync(
      tool === 'v1' ? 'llman' : 'bun',
      tool === 'v1' ? full : [V2_CLI, ...full],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
  };
  const e1 = bothArgs('v1');
  const e2 = bothArgs('v2');
  check(
    'change new id+from mutual exclusion',
    e1.code !== 0 && e2.code !== 0 && e2.out.includes('mutually exclusive'),
    `v1=${e1.code} v2=${e2.code}`,
  );
}

// -- 2. fresh init products (AGENTS.md divergence is ruled: see design D5) ---
function initMatrix(): void {
  const roots: Record<string, string> = {};
  for (const tool of ['v1', 'v2'] as const) {
    const root = mkdtempSync(join(tmpdir(), `llman-parity-init-${tool}-`));
    roots[tool] = root;
    const args = tool === 'v1' ? ['sdd', 'init'] : ['init'];
    const out = tool === 'v1' ? v1(args, root) : v2(args, root);
    check(`init ${tool} exit`, !/error/i.test(out));
  }
  const v1Skills = readdirSync(join(roots['v1']!, '.agents', 'skills')).toSorted();
  const v2Skills = readdirSync(join(roots['v2']!, '.agents', 'skills')).toSorted();
  check('init skills tree', JSON.stringify(v1Skills) === JSON.stringify(v2Skills));
  const versionRe = /\b\d+\.\d+\.\d+\b/gu;
  const diffed: string[] = [];
  for (const dir of v1Skills) {
    const a = readFileSync(join(roots['v1']!, '.agents', 'skills', dir, 'SKILL.md'), 'utf8');
    const b = readFileSync(join(roots['v2']!, '.agents', 'skills', dir, 'SKILL.md'), 'utf8');
    if (a.replaceAll(versionRe, '<V>') !== b.replaceAll(versionRe, '<V>')) diffed.push(dir);
  }
  check('init skills content', diffed.length === 0, diffed.join(','));
  // Root AGENTS.md managed block: both wrap a stub with the same markers.
  const rootA = readFileSync(join(roots['v1']!, 'AGENTS.md'), 'utf8');
  const rootB = readFileSync(join(roots['v2']!, 'AGENTS.md'), 'utf8');
  check(
    'init root AGENTS.md managed block',
    rootA.includes('LLMANSPEC:START') === rootB.includes('LLMANSPEC:START'),
  );
  // llmanspec/AGENTS.md: RULED divergence — v1 leaves a bare stub, v2 wraps a
  // managed block (spec r17 pins the v2 shape). Recorded, not a drift.
  const lmA = existsSync(join(roots['v1']!, 'llmanspec', 'AGENTS.md'));
  const lmB = existsSync(join(roots['v2']!, 'llmanspec', 'AGENTS.md'));
  const bHasBlock = lmB
    ? readFileSync(join(roots['v2']!, 'llmanspec', 'AGENTS.md'), 'utf8').includes('LLMANSPEC:START')
    : false;
  check('init llmanspec AGENTS.md (ruled divergence)', lmA === lmB && (!lmB || bHasBlock));
}

// -- 3. freeze/thaw parameter combinations ------------------------------------
function freezeMatrix(): void {
  const run = (tool: 'v1' | 'v2', args: string[]): string => {
    const root = freshRepo();
    mkdirSync(join(root, 'llmanspec', 'changes', 'archive', '2026-01-01-old'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'changes', 'archive', '2026-01-01-old', 'p.md'), 'x\n');
    mkdirSync(join(root, 'llmanspec', 'changes', 'archive', '2026-06-01-new'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'changes', 'archive', '2026-06-01-new', 'p.md'), 'y\n');
    commitAll(root);
    const full = tool === 'v1' ? ['sdd', 'archive', ...args] : ['archive', ...args];
    return normalizeCliText(runCapture(tool === 'v1' ? ['llman'] : ['bun', V2_CLI], full, root));
  };
  const cases = [
    { label: 'dry-run', args: ['freeze', '--dry-run'] },
    { label: 'keep-recent', args: ['freeze', '--keep-recent', '1'] },
    { label: 'list-empty', args: ['archive', 'freeze', '--list'] },
  ];
  for (const c of cases) {
    const args = c.label === 'list-empty' ? ['freeze', '--list'] : c.args;
    const a = run('v1', args);
    const b = run('v2', args);
    check(
      `freeze ${c.label}`,
      a.split('\n').toSorted().join('\n') === b.split('\n').toSorted().join('\n'),
      `v1=[${a.split('\n')[0]}] v2=[${b.split('\n')[0]}]`,
    );
  }
  // thaw unknown name → both must fail non-zero with a listing.
  const thawUnknown = (tool: 'v1' | 'v2'): string => {
    const root = freshRepo();
    mkdirSync(join(root, 'llmanspec', 'changes', 'archive', '2026-01-01-old'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'changes', 'archive', '2026-01-01-old', 'p.md'), 'x\n');
    commitAll(root);
    const seed = tool === 'v1' ? ['sdd', 'archive', 'freeze'] : ['archive', 'freeze'];
    runCapture(tool === 'v1' ? ['llman'] : ['bun', V2_CLI], seed, root);
    const full =
      tool === 'v1'
        ? ['sdd', 'archive', 'thaw', '--change', 'no-such']
        : ['archive', 'thaw', '--change', 'no-such'];
    const out = runCapture(tool === 'v1' ? ['llman'] : ['bun', V2_CLI], full, root);
    return out;
  };
  const t1 = thawUnknown('v1');
  const t2 = thawUnknown('v2');
  check(
    'thaw unknown name errors',
    /no-such|unknown|not found/i.test(t1) && /no-such|unknown|not found/i.test(t2),
  );
}

// -- 4. review --export-html ---------------------------------------------------
function reviewHtmlMatrix(): void {
  const outs: Record<string, string> = {};
  for (const tool of ['v1', 'v2'] as const) {
    const root = mkdtempSync(join(tmpdir(), `llman-parity-html-${tool}-`));
    mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
    writeFileSync(
      join(root, 'llmanspec', 'specs', 's.feature'),
      '# language: zh-CN\n# capability: s\n# purpose: p\n# scope: llmanspec/\n\n功能: s\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n',
    );
    commitAll(root);
    const full =
      tool === 'v1'
        ? ['sdd', 'review', '--export-html', 'r.html']
        : ['review', '--export-html', 'r.html'];
    runCapture(tool === 'v1' ? ['llman'] : ['bun', V2_CLI], full, root);
    outs[tool] = existsSync(join(root, 'r.html')) ? readFileSync(join(root, 'r.html'), 'utf8') : '';
  }
  check(
    'review export-html self-contained',
    outs['v1']!.includes('<html') && outs['v2']!.includes('<html'),
  );
  check(
    'review export-html signals payload',
    outs['v1']!.includes('__SIGNALS__') === false && outs['v2']!.includes('__SIGNALS__') === false,
  );
}

// -- 5. context guard & error paths -------------------------------------------
function contextGuardMatrix(): void {
  const env = { ...process.env } as Record<string, string>;
  delete env.LLMAN_SDD_INDEX_CHAT_MODEL;
  const probe = (cmd: string[]): { code: number; out: string } => {
    const proc = spawnSync(cmd[0] as string, cmd.slice(1), {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
    });
    return { code: proc.status ?? 1, out: proc.stdout ?? '' };
  };
  const a = probe(['llman', 'sdd', 'context', '--task', 'x']);
  const b = probe(['bun', V2_CLI, 'context', '--task', 'x']);
  // v1 parity: unavailable JSON on stdout, exit 0.
  check('context guard exit zero', a.code === 0 && b.code === 0, `v1=${a.code} v2=${b.code}`);
  check(
    'context guard unavailable json',
    a.out.includes('"unavailable"') && b.out.includes('"unavailable"'),
  );
  const badA = probe([
    'llman',
    'sdd',
    'show',
    'no-such-change',
    '--output',
    'json',
    '--type',
    'change',
  ]);
  const badB = probe(['bun', V2_CLI, 'show', 'no-such-change', '--output', 'json']);
  check('show unknown change exits non-zero', badA.code !== 0 && badB.code !== 0);
}

lifecycleMatrix();
initMatrix();
freezeMatrix();
reviewHtmlMatrix();
contextGuardMatrix();

console.log(`\ntemp parity v1: ${pass} ok, ${fail} drift`);
if (fail > 0) {
  console.error('drifts:\n' + divergences.map((d) => `  - ${d}`).join('\n'));
  process.exit(1);
}
