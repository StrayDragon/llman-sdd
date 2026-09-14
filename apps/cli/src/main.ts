import { VERSION } from '@llman-sdd/core';
import { Command } from 'commander';

// Injected at binary build time by scripts/build-binary.ts; falls back to the
// package version when running from source.
const version = process.env.LLMAN_SDD_VERSION ?? VERSION;

const program = new Command();

program
  .name('llman-sdd')
  .description('Spec-driven development workflow (TypeScript rewrite of llman sdd)')
  .version(version);

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

await main();
