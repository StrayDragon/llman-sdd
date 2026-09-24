import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

function runCli(extra: string[]): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync('bun', ['apps/cli/src/main.ts', 'graph', '--scope', 'all', ...extra], {
    encoding: 'utf8',
  });
  return { status: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

describe('graph --format (mermaid only)', () => {
  test('mermaid default unchanged', () => {
    const m = runCli([]);
    expect(m.status).toBe(0);
    expect(m.stdout).toInclude('flowchart TD');
  });
  test('non-mermaid formats rejected with exit 2', () => {
    for (const format of ['json', 'toon', 'dot']) {
      const r = runCli(['--format', format]);
      expect(r.status).toBe(2);
      expect(r.stderr).toInclude('unsupported --format');
      expect(r.stderr).toInclude('mermaid only');
    }
  });
});
