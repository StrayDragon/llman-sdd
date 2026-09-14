// Golden drift gate: re-render skills with v1 and diff against the committed
// baseline under tests/golden/baseline/. Exit code 1 on drift.
//
// Today this proves the harness + v1 determinism; once v2's init lands, the
// same baseline becomes v2's byte-exact acceptance target.
// Run: bun run golden:check
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_DIR, renderV1Skills } from './lib.ts';

const result = renderV1Skills();
try {
  const baselineVersion = readFileSync(join(BASELINE_DIR, 'VERSION'), 'utf8').trim();
  const baselineSkills = join(BASELINE_DIR, 'skills');
  try {
    execFileSync('diff', ['-r', '--exclude', 'VERSION', result.skillsDir, baselineSkills], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    const e = err as { stderr?: Buffer };
    console.error('golden drift detected:\n' + (e.stderr?.toString() ?? String(err)));
    process.exit(1);
  }
  console.log(`golden check passed: fresh v1 render matches baseline (${baselineVersion})`);
} finally {
  rmSync(result.tmpRoot, { recursive: true, force: true });
}
