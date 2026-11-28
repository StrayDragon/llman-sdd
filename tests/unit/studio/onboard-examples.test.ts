import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initGitRepo, REPO_ROOT, runCli } from '../../helpers/spawn.ts';

const ONBOARD = join(
  REPO_ROOT,
  'packages',
  'core',
  'templates',
  'zh-Hans',
  'skills',
  'llman-sdd-studio-onboard.md',
);

function extractGherkinFences(src: string): string[] {
  const out: string[] = [];
  const re = /```gherkin\n([\s\S]*?)```/gu;
  for (const m of src.matchAll(re)) {
    if (m[1] !== undefined && m[1].trim() !== '') out.push(m[1].trimEnd() + '\n');
  }
  return out;
}

test('E3: onboard gherkin examples pass studio validate --specs', () => {
  const fences = extractGherkinFences(readFileSync(ONBOARD, 'utf8'));
  expect(fences.length).toBeGreaterThan(0);
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-onboard-ex-'));
  try {
    initGitRepo(root, 'main');
    mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: zh-Hans\n');
    for (const [i, body] of fences.entries()) {
      const idMatch = /^功能:\s+(\S+)/mu.exec(body);
      const specId = idMatch?.[1] ?? `example-${String(i)}`;
      writeFileSync(join(root, 'llmanspec', 'specs', `${specId}.feature`), body);
    }
    spawnSync('git', ['add', '-A'], { cwd: root });
    spawnSync('git', ['commit', '-qm', 'fixture'], { cwd: root });
    const studio = runCli(['studio', 'validate', '--specs'], root);
    expect(studio.status).toBe(0);
    expect(studio.stderr).not.toMatch(/^Error:/u);
    const specs = runCli(['validate', '--specs'], root);
    expect(specs.status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
