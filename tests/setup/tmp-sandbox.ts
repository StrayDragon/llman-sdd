import { afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Test helpers create temp repos via `mkdtempSync(join(tmpdir(), ...))` without
// removing them; left unchecked this exhausts tmpfs inodes (ENOSPC). Redirecting
// TMPDIR into one per-run sandbox (inherited by spawned CLI/git subprocesses)
// lets a single global hook reclaim everything.
const sandbox = mkdtempSync(join(tmpdir(), 'llman-sdd-test-run-'));
process.env.TMPDIR = sandbox;
afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});
