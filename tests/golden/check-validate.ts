// Golden gate for the validation engine: seed a temp git repo with known
// defects, run v1 (`llman sdd validate --specs`) and v2
// (`apps/cli validate --specs --no-check`), and compare the normalized entry
// line sets (`OK|FAIL spec/*` + `Totals:`). staleness/coverage lines are
// v1-side details outside this phase's scope and are excluded by the filter.
// Requires `llman` (v1) on PATH. Run: bun run golden:validate
import { execFileSync } from 'node:child_process'; // retained for potential debug capture
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const GOOD = (cap: string, req: string): string => `# language: zh-CN
# capability: ${cap}
# purpose: p
# scope: llmanspec/

功能: ${cap}

  @req:${req} @human
  场景: ok
    - 系统 MUST x
`;

const SPECS: Record<string, string> = {
  'good.feature': GOOD('good', 'r1'),
  // mutual exclusion defect (@human + @executable)
  'mutual.feature': `# language: zh-CN
# capability: mutual
# purpose: p
# scope: llmanspec/

功能: mutual

  @req:r2 @human @executable
  场景: 互斥
    - 系统 MUST x
`,
  // duplicate req_id pair
  'dupa.feature': GOOD('dupa', 'r9'),
  'dupb.feature': GOOD('dupb', 'r9'),
};

const tmpRoot = mkdtempSync(join(tmpdir(), 'llman-sdd-golden-validate-'));
try {
  mkdirSync(join(tmpRoot, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(tmpRoot, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  for (const [name, content] of Object.entries(SPECS)) {
    writeFileSync(join(tmpRoot, 'llmanspec', 'specs', name), content);
  }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: tmpRoot });
  execFileSync('git', ['add', '-A'], { cwd: tmpRoot });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'i'], {
    cwd: tmpRoot,
  });

  const entryLines = (output: string): string[] =>
    output
      .split('\n')
      .filter((l) => /^(OK|FAIL) spec\//.test(l) || l.startsWith('Totals:'))
      .toSorted();

  const runCapture = (cmd: string[], args: string[]): string => {
    const proc = Bun.spawnSync([cmd[0] as string, ...cmd.slice(1), ...args], {
      cwd: tmpRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    // v1 prints FAIL entries on stderr and OK entries on stdout; normalize over both.
    return `${proc.stdout.toString()}\n${proc.stderr.toString()}`;
  };

  const v1 = runCapture(['llman'], ['sdd', 'validate', '--specs', '--no-check', '--strict']);
  const v2 = runCapture(
    ['bun', join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts')],
    ['validate', '--specs', '--no-check'],
  );

  const v1Lines = entryLines(v1);
  const v2Lines = entryLines(v2);
  if (JSON.stringify(v1Lines) !== JSON.stringify(v2Lines)) {
    console.error('validate golden drift:\nv1:', v1Lines, '\nv2:', v2Lines);
    process.exit(1);
  }
  console.log(`validate golden check passed (${v1Lines.length} normalized lines match v1)`);
} finally {
  rmSync(tmpRoot, { recursive: true, force: true });
}
