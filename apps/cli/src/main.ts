import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  VERSION,
  loadConfig,
  parseCapability,
  validateAllSpecs,
  type DiscoveryIo,
} from '@llman-sdd/core';
import { Command } from 'commander';

// Injected at binary build time by scripts/build-binary.ts; falls back to the
// package version when running from source.
const version = process.env.LLMAN_SDD_VERSION ?? VERSION;

function collectFeatureFiles(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).toSorted()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...collectFeatureFiles(full));
    else if (name.endsWith('.feature')) out.push(full);
  }
  return out;
}

const FS_IO: DiscoveryIo = {
  exists: (p) => existsSync(p),
  isDirectory: (p) => existsSync(p) && statSync(p).isDirectory(),
  listDir: (p) => readdirSync(p),
  readText: (p) => readFileSync(p, 'utf8'),
};

function runValidateSpecs(options: { specs?: boolean; check: boolean }): number {
  const entries = collectFeatureFiles('llmanspec/specs').map((path) => ({
    fileName: path,
    doc: parseCapability(readFileSync(path, 'utf8'), path),
  }));
  const report = validateAllSpecs(entries, FS_IO);
  for (const line of report.lines) console.log(line);

  let failed = report.failed;
  if (options.check && existsSync('llmanspec/config.yaml')) {
    const config = loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'));
    const runCommand = config.bdd?.run_command;
    if (runCommand) {
      const proc = spawnSync(runCommand, { shell: true, stdio: 'inherit' });
      if ((proc.status ?? 1) !== 0) failed = true;
    }
  }
  return failed ? 1 : 0;
}

const program = new Command();

program
  .name('llman-sdd')
  .description('Spec-driven development workflow (TypeScript rewrite of llman sdd)')
  .version(version);

program
  .command('validate')
  .description('Validate specs under llmanspec/specs (structural gates, v1 verdict parity)')
  .option('--specs', 'validate specs (default and only scope for now)')
  .option('--no-check', 'skip the bdd.run_command check (structural validation only)')
  .action((options: { specs?: boolean; check: boolean }) => {
    process.exit(runValidateSpecs(options));
  });

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

await main();
