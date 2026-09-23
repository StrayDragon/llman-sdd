import { expect, test } from 'bun:test';
// Module dependency parity gate (monorepo-structure r72).
//
// Freezes the current cross-module import graph of packages/core/src as a
// declared allowlist. Cycles found in the 2026-09 architecture review stay
// frozen (no NEW edges) until a dedicated change removes them; every removal
// must shrink the table below (drift is reported the other way, so a stale
// allowlist entry cannot silently survive).
//
// Node = first path segment under src/ ('root' for src/*.ts); the public
// barrel src/index.ts is exempt (it re-exports everything by design).
// `import type` and re-exports count the same as value imports (type coupling
// is coupling); intra-module imports and 'node:'/package imports are out of
// scope (core purity is r3's job).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SRC_DIR = join(REPO_ROOT, 'packages', 'core', 'src');

/** Declared allowed module edges — SSOT for r72. Shrink on decoupling. */
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  change: ['git'],
  config: ['change'],
  context: ['spec', 'validation'],
  init: ['config', 'templates'],
  report: ['change', 'git', 'render', 'spec', 'templates', 'validation'],
  review: ['git', 'spec', 'validation'],
  templates: ['config'],
  validation: ['change', 'git', 'spec'],
  // leaves (git, spec, render, root) have no outgoing edges by declaration
  git: [],
  spec: [],
  render: [],
  root: [],
};

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

function moduleOf(rel: string): string {
  const first = rel.split('/')[0] ?? rel;
  return first.endsWith('.ts') ? 'root' : first;
}

test('core cross-module imports match the declared allowlist (r72)', () => {
  const violations: string[] = [];
  const actual = new Set<string>();

  for (const file of collectTsFiles(SRC_DIR)) {
    const rel = file.slice(SRC_DIR.length + 1);
    if (rel === 'index.ts') continue; // public barrel: imports everything
    const srcMod = moduleOf(rel);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/from '(\.\.?\/[^']+)'/gu)) {
      const spec = m[1];
      if (spec === undefined) continue;
      const target = posix.normalize(posix.join(posix.dirname(rel), spec));
      const dstMod = moduleOf(target);
      if (dstMod === srcMod) continue;
      actual.add(`${srcMod} -> ${dstMod}`);
      const allowed = ALLOWED[srcMod] ?? [];
      if (!allowed.includes(dstMod)) {
        violations.push(`[${rel}] ${srcMod} -> ${dstMod} is not in the allowlist`);
      }
    }
  }

  // Drift the other way: declared edges whose implementation disappeared
  // (e.g. after decoupling) must be removed from ALLOWED.
  for (const [srcMod, dsts] of Object.entries(ALLOWED)) {
    for (const dstMod of dsts) {
      if (!actual.has(`${srcMod} -> ${dstMod}`)) {
        violations.push(
          `[ALLOWED] ${srcMod} -> ${dstMod} has no implementation — shrink the table`,
        );
      }
    }
  }

  expect(actual.size).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
