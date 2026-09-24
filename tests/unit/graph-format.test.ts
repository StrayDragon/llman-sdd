import { describe, expect, test } from 'bun:test';

import { runCli as spawnCli } from '../helpers/spawn.ts';

const runCli = (extra: string[]) => spawnCli(['graph', '--scope', 'all', ...extra]);

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
