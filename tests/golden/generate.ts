// Regenerate the golden baseline from v1 (Rust llman).
// Requires `llman` on PATH (v1 0.0.x). Run: bun run golden:generate
import { rmSync } from 'node:fs';

import { captureBaseline, renderV1Skills } from './lib.ts';

const result = renderV1Skills();
try {
  const entries = captureBaseline(result);
  console.log(`baseline captured from v1 (${result.version}): ${entries.length} skills`);
} finally {
  rmSync(result.tmpRoot, { recursive: true, force: true });
}
