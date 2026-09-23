// Golden drift gate: re-render skills with v2's own renderer (runInit) and
// diff against the committed v2 self-snapshot baseline under
// tests/golden/baseline/ (version-normalized — the local package version may
// move without touching template contracts).
// Exit code 1 on drift. Run: bun run golden:check
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { BASELINE_DIR, renderV2Skills } from './lib.ts';

const VERSION_RE = /\b\d+\.\d+\.\d+\b/gu;

/** Walk a rendered skills dir into a map of version-normalized file contents. */
function normalizeTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    const full = join(root, rel);
    for (const name of readdirSync(full).toSorted()) {
      const childRel = rel === '' ? name : `${rel}/${name}`;
      const childFull = join(root, childRel);
      if (statSync(childFull).isDirectory()) {
        walk(childRel);
      } else {
        out.set(childRel, readFileSync(childFull, 'utf8').replaceAll(VERSION_RE, '<VER>'));
      }
    }
  };
  if (existsSync(root)) walk('');
  return out;
}

function diffTrees(a: Map<string, string>, b: Map<string, string>, label: string): boolean {
  const keys = [...new Set([...a.keys(), ...b.keys()])].toSorted();
  let same = true;
  for (const key of keys) {
    const va = a.get(key);
    const vb = b.get(key);
    if (va !== vb) {
      same = false;
      console.error(
        `[${label}] drift at ${key}:\n--- baseline\n+++ other\n${va ?? '<missing>'}\n---\n${vb ?? '<missing>'}`,
      );
    }
  }
  return same;
}

// Both locales gate: baseline/skills (zh-Hans) and baseline/skills-en.
let ok = true;
const counts: string[] = [];
for (const [locale, subdir] of [
  ['zh-Hans', 'skills'],
  ['en', 'skills-en'],
] as const) {
  const baselineTree = normalizeTree(join(BASELINE_DIR, subdir));
  const v2 = renderV2Skills(locale);
  try {
    const freshTree = normalizeTree(v2.skillsDir);
    if (!diffTrees(baselineTree, freshTree, `render-vs-baseline/${subdir}`)) ok = false;
    counts.push(`${subdir}: ${baselineTree.size} files`);
  } finally {
    rmSync(v2.tmpRoot, { recursive: true, force: true });
  }
}
if (!ok) process.exit(1);
console.log(
  `golden check passed: fresh v2 render matches baseline (${counts.join(', ')}, versions normalized)`,
);
