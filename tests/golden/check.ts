// Golden drift gate: re-render skills with v2's own renderer (runInit) and
// diff against the committed v2 self-snapshot baseline under
// tests/golden/baseline/ (version-normalized — the local package version may
// move without touching template contracts). Also gates the repo's own
// committed .agents/skills against the zh-Hans baseline (init-generators r80).
// Exit code 1 on drift. Run: bun run check:skills-template-render
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  BASELINE_DIR,
  assertRepoConfigMatchesGolden,
  diffRepoSkills,
  diffTrees,
  formatTreeDiffs,
  normalizeTree,
  renderV2Skills,
} from './lib.ts';

let ok = true;
const counts: string[] = [];

// Both locales gate: baseline/skills (zh-Hans) and baseline/skills-en.
for (const [locale, subdir] of [
  ['zh-Hans', 'skills'],
  ['en', 'skills-en'],
] as const) {
  const baselineTree = normalizeTree(join(BASELINE_DIR, subdir));
  const v2 = renderV2Skills(locale);
  try {
    const diffs = diffTrees(baselineTree, normalizeTree(v2.skillsDir));
    if (diffs.length > 0) {
      ok = false;
      console.error(`[render-vs-baseline/${subdir}] drift:\n${formatTreeDiffs(diffs)}`);
    }
    counts.push(`${subdir}: ${baselineTree.size} files`);
  } finally {
    rmSync(v2.tmpRoot, { recursive: true, force: true });
  }
}

assertRepoConfigMatchesGolden();
const repoDiffs = diffRepoSkills();
if (repoDiffs.length > 0) {
  ok = false;
  console.error(
    `[repo-skills-vs-baseline] .agents/skills is stale:\n${formatTreeDiffs(repoDiffs)}\nrun: bun apps/cli/src/main.ts init --update`,
  );
}
counts.push('.agents/skills: fresh');

if (!ok) process.exit(1);
console.log(
  `golden check passed: fresh v2 render matches baseline (${counts.join(', ')}, versions normalized)`,
);
