// BDD entry point — auto-scans all .feature files and runs them.
//
// Importing this module (via `bun test tests/bdd`) registers the step
// definitions (side effect), then walks the features/ directory and turns
// every feature into a bun:test describe block. Domain step modules are
// registered here as they land (one import line each).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import './steps/smoke.ts';
import './steps/config.ts';
import './steps/parse.ts';
import './steps/validation.ts';
import './steps/lifecycle.ts';
import './steps/archive.ts';
import './steps/init.ts';
import './steps/review.ts';
import './steps/context-index.ts';
import './steps/peripheral.ts';
import './steps/output-contract.ts';
import './steps/spec-authoring.ts';
import './steps/context.ts';
import { runFeature, type TestContext } from './runner.ts';
import './steps/meta-foundation.ts';

const FEATURES_DIR = join(import.meta.dirname, 'features');
// Capability specs (@executable scenarios drive the real core APIs).
const SPECS_DIR = join(import.meta.dirname, '..', '..', 'llmanspec', 'specs');

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

for (const featurePath of collectFeatures(SPECS_DIR)) {
  runFeature(featurePath, makeContext, { onlyTagged: '@executable' });
}
