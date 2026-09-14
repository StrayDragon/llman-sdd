// Generate artifacts/schema/configs/en/llmanspec-config.schema.json from the
// zod SSOT (packages/core/src/config/schema.ts). `--check` exits non-zero on
// drift instead of writing (prek/CI gate). Run: bun run gen:schema [-- --check]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { sddConfigSchema } from '@llman-sdd/core';
import { z } from 'zod';

const TARGET = new URL(
  '../artifacts/schema/configs/en/llmanspec-config.schema.json',
  import.meta.url,
).pathname;
const check = process.argv.includes('--check');

const generated: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'SddConfig',
  description: 'SDD project configuration for llmanspec.',
  ...z.toJSONSchema(sddConfigSchema, { target: 'draft-7', io: 'input' }),
};
const serialized = `${JSON.stringify(generated, null, 2)}\n`;

if (check) {
  const existing = readFileSync(TARGET, 'utf8');
  if (existing !== serialized) {
    console.error(`schema artifact drift at ${TARGET} — run \`bun run gen:schema\` to refresh`);
    process.exit(1);
  }
  console.log('schema artifact up to date');
} else {
  mkdirSync(dirname(TARGET), { recursive: true });
  writeFileSync(TARGET, serialized);
  console.log(`wrote ${TARGET}`);
}
