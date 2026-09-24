// Generate artifacts/schema/configs/en/llmanspec-config.schema.json from the
// zod SSOT (packages/core/src/config/schema.ts). `--check [artifactPath]`
// exits non-zero on drift instead of writing (prek/CI gate); an explicit
// artifact path compares against that copy only — the repo file is never
// touched (r6 executable acceptance: copy → check 0 → tamper → check != 0).
// Run: bun run gen:schema [-- --check [artifactPath]]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { sddConfigSchema } from '@llman-sdd/core';
import { z } from 'zod';

const TARGET = new URL(
  '../artifacts/schema/configs/en/llmanspec-config.schema.json',
  import.meta.url,
).pathname;
const args = process.argv.slice(2);
const check = args.includes('--check');
const artifactPath = args.find((arg) => !arg.startsWith('--'));

const generated: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SddConfig',
  description: 'SDD project configuration for llmanspec.',
  ...z.toJSONSchema(sddConfigSchema, { target: 'draft-7', io: 'input' }),
};
const serialized = `${JSON.stringify(generated, null, 2)}\n`;

if (check) {
  const target = artifactPath ?? TARGET;
  const existing = readFileSync(target, 'utf8');
  if (existing !== serialized) {
    const existingLines = existing.split('\n');
    const serializedLines = serialized.split('\n');
    let line = 0;
    while (
      line < existingLines.length &&
      line < serializedLines.length &&
      existingLines[line] === serializedLines[line]
    ) {
      line += 1;
    }
    console.error(
      `schema artifact drift at ${target} (first diff at line ${String(line + 1)}) — run \`bun run gen:schema\` to refresh`,
    );
    process.exit(1);
  }
  console.log('schema artifact up to date');
} else {
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, serialized);
  console.log(`wrote ${TARGET}`);
}
