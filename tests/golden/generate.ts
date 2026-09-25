// Regenerate the skills baseline from v2's own renderer (runInit), BOTH
// locales: baseline/skills (zh-Hans, same-config-as-repo) and baseline/skills-en
// (identical config modulo locale) — en-only template drift is gated too.
// Run: bun run generate:skills-template-baseline
import { rmSync } from 'node:fs';

import { captureBaseline, renderV2Skills } from './lib.ts';

for (const [locale, subdir] of [
  ['zh-Hans', 'skills'],
  ['en', 'skills-en'],
] as const) {
  const result = renderV2Skills(locale);
  try {
    const entries = captureBaseline(result.skillsDir, result.version, subdir);
    console.log(
      `baseline captured from v2 (${result.version}, ${locale}): ${entries.length} skills`,
    );
  } finally {
    rmSync(result.tmpRoot, { recursive: true, force: true });
  }
}
