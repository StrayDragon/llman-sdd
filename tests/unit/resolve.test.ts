import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ChangeIdResolveError, resolveChangeId } from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';

function makeChangesRepo(ids: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'llman-resolve-'));
  for (const id of ids) {
    const dir = join(root, 'llmanspec', 'changes', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  }
  return root;
}

describe('resolveChangeId (r61 / v1 r112)', () => {
  test('exact match wins even when another id extends it', () => {
    const root = makeChangesRepo(['c123', 'c123-foo']);
    expect(resolveChangeId(makeNodeIo(root), root, 'c123')).toEqual({
      id: 'c123',
      viaPrefix: false,
    });
  });

  test('unique prefix resolves with viaPrefix=true', () => {
    const root = makeChangesRepo(['c2805-update-todo', 'c2806-fix-bug']);
    expect(resolveChangeId(makeNodeIo(root), root, 'c2805')).toEqual({
      id: 'c2805-update-todo',
      viaPrefix: true,
    });
  });

  test('multiple prefix matches list all candidates', () => {
    const root = makeChangesRepo(['c123-foo', 'c123-bar', 'c456']);
    expect(() => resolveChangeId(makeNodeIo(root), root, 'c123')).toThrow(ChangeIdResolveError);
    try {
      resolveChangeId(makeNodeIo(root), root, 'c123');
    } catch (error) {
      const msg = (error as Error).message;
      expect(msg).toContain("change 'c123' matches multiple active changes");
      expect(msg).toContain('  - c123-foo');
      expect(msg).toContain('  - c123-bar');
    }
  });

  test('no match reports change not found', () => {
    const root = makeChangesRepo(['c2805-update-todo']);
    expect(() => resolveChangeId(makeNodeIo(root), root, 'zzz')).toThrow('change not found: zzz');
  });

  test('resolution is case-sensitive', () => {
    const root = makeChangesRepo(['c2805-update-todo']);
    expect(() => resolveChangeId(makeNodeIo(root), root, 'C2805')).toThrow(
      'change not found: C2805',
    );
  });

  test('archived changes are not candidates', () => {
    const root = makeChangesRepo(['c2805-update-todo']);
    const archived = join(root, 'llmanspec', 'changes', 'archive', '2026-01-01-old-demo');
    mkdirSync(archived, { recursive: true });
    writeFileSync(join(archived, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
    expect(() => resolveChangeId(makeNodeIo(root), root, '2026-01-01')).toThrow(
      'change not found: 2026-01-01',
    );
  });
});
