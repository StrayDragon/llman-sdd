// A2 platform-compat guards: parent resolution MUST go through node:path.
// Hand-rolled lastIndexOf('/') breaks win32 nested writes (parent resolves to
// '.', mkdir never happens, writeFileSync → ENOENT). These tests (a) pin the
// platform-neutral behavior everywhere, and (b) run a win32-separator case on
// the CI windows job where the real separators are in force.
import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeIo, parentOf } from '../../apps/cli/src/io.ts';

test('parentOf resolves a real parent for joined paths', () => {
  const root = join('repo', 'nested');
  expect(parentOf(join(root, 'proposal.md'))).toBe(join('repo', 'nested'));
});

test('parentOf of a bare filename is the current directory', () => {
  expect(parentOf('proposal.md')).toBe('.');
});

test('makeIo writeText creates parent directories for nested relative paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-io-'));
  try {
    const io = makeIo(root);
    io.writeText('llmanspec/changes/demo/proposal.md', 'body');
    expect(io.readText('llmanspec/changes/demo/proposal.md')).toBe('body');
    expect(existsSync(join(root, 'llmanspec', 'changes', 'demo', 'proposal.md'))).toBe(true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Windows-only: real win32 paths and separators (executed on the CI windows job).
test.skipIf(process.platform !== 'win32')(
  'makeIo writeText succeeds for win32-separator nested paths',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-sdd-io-'));
    try {
      const io = makeIo(root);
      io.writeText('deep\\nested\\change\\proposal.md', 'body');
      expect(io.readText('deep\\nested\\change\\proposal.md')).toBe('body');
      expect(parentOf(join(root, 'deep', 'nested', 'change', 'proposal.md'))).toBe(
        join(root, 'deep', 'nested', 'change'),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
