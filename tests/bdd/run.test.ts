// BDD entry point — auto-scans all .feature files and runs them.
//
// Importing this module (via `bun test tests/bdd`) registers the step
// definitions (side effect), then walks the features/ directory and turns
// every feature into a bun:test describe block. Domain step modules are
// registered here as they land (one import line each).
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import './steps/smoke.ts';
import './steps/domain.ts';
import './steps/context.ts';
import { runFeature, type TestContext } from './runner.ts';

const FEATURES_DIR = join(import.meta.dirname, 'features');
// Capability specs (@executable scenarios drive the real core APIs).
const SPECS_DIR = join(import.meta.dirname, '..', '..', 'llmanspec', 'specs');

// Live v1↔v2 parity scenarios need the Rust v1 binary; CI environments
// without it skip exactly those scenarios instead of failing the suite.
const HAS_V1 =
  Bun.spawnSync(['llman', '--version'], { stdout: 'pipe', stderr: 'pipe' }).exitCode === 0;
const V1_PARITY_SCENARIOS = /活体 golden|v1 冻结/;

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
  runFeature(featurePath, makeContext, {
    onlyTagged: '@executable',
    ...(HAS_V1 ? {} : { skipScenarios: V1_PARITY_SCENARIOS }),
  });
}
if (!HAS_V1) {
  console.log('[bdd] v1 binary not on PATH — skipping live v1↔v2 parity scenarios');
}
