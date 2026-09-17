// Regenerate the skills baseline from v2's own renderer (runInit).
// Run: bun run golden:generate
import { rmSync } from 'node:fs';

import { captureBaseline, renderV2Skills } from './lib.ts';

const result = renderV2Skills();
try {
  const entries = captureBaseline(result.skillsDir, result.version);
  console.log(`baseline captured from v2 (${result.version}): ${entries.length} skills`);
} finally {
  rmSync(result.tmpRoot, { recursive: true, force: true });
}
