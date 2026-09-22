import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

import { decode } from '@toon-format/toon';

function runCli(extra: string[]): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync('bun', ['apps/cli/src/main.ts', 'graph', '--scope', 'all', ...extra], {
    encoding: 'utf8',
  });
  return { status: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

describe('graph machine formats (cli-output-cleanup)', () => {
  test('mermaid default unchanged; json/toon expose the same traversal', () => {
    const m = runCli([]);
    expect(m.status).toBe(0);
    expect(m.stdout).toInclude('flowchart TD');
    const j = runCli(['--format', 'json']);
    expect(j.status).toBe(0);
    const ir = JSON.parse(j.stdout) as {
      scope: string;
      nodes: { id: string }[];
      edges: { from: string; to: string }[];
    };
    expect(ir.scope).toBe('all');
    expect(Array.isArray(ir.nodes)).toBe(true);
    expect(Array.isArray(ir.edges)).toBe(true);
    const t = runCli(['--format', 'toon']);
    expect(t.status).toBe(0);
    expect(decode(t.stdout)).toEqual(ir);
    // mermaid node ids ⊆ IR node ids(同一遍历,渲染占位行不计)
    for (const line of m.stdout.split('\n')) {
      const hit = /\["([^"]+)"/.exec(line);
      const raw = hit?.[1];
      if (raw !== undefined && !line.includes('subgraph') && !line.includes('empty[')) {
        const id = raw.replace(/ ✓ done$/u, '').replace(/ ⚠ missing$/u, '');
        expect(ir.nodes.some((n) => n.id === id)).toBe(true);
      }
    }
  });
});
