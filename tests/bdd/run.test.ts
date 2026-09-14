// BDD entry point — auto-scans all .feature files and runs them.
//
// Importing this module (via `bun test tests/bdd`) registers the step
// definitions (side effect), then walks the features/ directory and turns
// every feature into a bun:test describe block. Domain step modules are
// registered here as they land (one import line each).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import './steps/smoke.ts';
import { runFeature, type TestContext } from './runner.ts';

const FEATURES_DIR = join(import.meta.dirname, 'features');

function collectFeatures(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFeatures(full));
    } else if (entry.endsWith('.feature')) {
      results.push(full);
    }
  }
  return results.toSorted();
}

function makeContext(): TestContext {
  return { fixtures: {} };
}

for (const featurePath of collectFeatures(FEATURES_DIR)) {
  runFeature(featurePath, makeContext);
}
