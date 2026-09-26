// Regenerate the skills baseline from this repo's own renderer (runInit), BOTH
// locales: baseline/skills (zh-Hans, same-config-as-repo) and baseline/skills-en
// (identical config modulo locale) — en-only template drift is gated too.
// Run: bun run generate:skills-template-baseline
import { rmSync } from 'node:fs';

import { captureBaseline, renderSkills } from './lib.ts';

for (const [locale, subdir] of [
  ['zh-Hans', 'skills'],
  ['en', 'skills-en'],
] as const) {
  const result = renderSkills(locale);
  try {
    const entries = captureBaseline(result.skillsDir, result.version, subdir);
    console.log(
      `baseline captured from runInit (${result.version}, ${locale}): ${entries.length} skills`,
    );
  } finally {
    rmSync(result.tmpRoot, { recursive: true, force: true });
  }
}
