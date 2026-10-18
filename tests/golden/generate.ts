// Regenerate the skills baseline from this repo's own renderer (runInit) in the
// single built-in locale (zh-Hans, same config as this repo).
// Run: bun run generate:skills-template-baseline
import { rmSync } from 'node:fs';

import { captureBaseline, renderSkills } from './lib.ts';

const result = renderSkills();
try {
  const entries = captureBaseline(result.skillsDir, result.version);
  console.log(
    `baseline captured from runInit (${result.version}, zh-Hans): ${entries.length} skills`,
  );
} finally {
  rmSync(result.tmpRoot, { recursive: true, force: true });
}
