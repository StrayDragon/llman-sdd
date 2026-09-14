import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import {
  VERSION,
  attachChange,
  changeDiff,
  deriveChangeId,
  finalizeChange,
  loadConfig,
  makeSpawnGit,
  newChange,
  runInit,
  parseCapability,
  startChange,
  validateAllSpecs,
  type DiscoveryIo,
  type FsIo,
  type GitLike,
} from '@llman-sdd/core';
import { Command } from 'commander';

// Injected at binary build time by scripts/build-binary.ts; falls back to the
// package version when running from source.
const version = process.env.LLMAN_SDD_VERSION ?? VERSION;

/** Root-relative FsIo + GitLike adapters over node:fs / git subprocess. */
function makeFsIo(root: string): FsIo {
  return {
    exists: (p) => existsSync(join(root, p)),
    readText: (p) => readFileSync(join(root, p), 'utf8'),
    writeText: (p, content) => {
      const full = join(root, p);
      mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true });
      writeFileSync(full, content);
    },
    rename: (from, to) => {
      const target = join(root, to);
      mkdirSync(target.slice(0, target.lastIndexOf('/')), { recursive: true });
      renameSync(join(root, from), target);
    },
    listDir: (p) => readdirSync(join(root, p)),
  };
}

function makeCliGit(root: string): GitLike {
  return makeSpawnGit(root);
}

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
  .command('init')
  .description('Initialize llmanspec in your project (--update to refresh existing)')
  .option('--update', 'refresh an existing installation')
  .option('--locale <locale>', 'locale for generated templates (defaults to config or en)')
  .action((options: { update?: boolean; locale?: string }) => {
    const result = runInit(process.cwd(), {
      update: options.update ?? false,
      locale: options.locale,
      version,
    });
    const removed = result.removed.length > 0 ? `, removed: ${result.removed.join(', ')}` : '';
    console.log(`initialized llmanspec (${result.skills.length} skills${removed})`);
  });

program
  .command('validate')
  .description('Validate specs under llmanspec/specs (structural gates, v1 verdict parity)')
  .option('--specs', 'validate specs (default and only scope for now)')
  .option('--no-check', 'skip the bdd.run_command check (structural validation only)')
  .action((options: { specs?: boolean; check: boolean }) => {
    process.exit(runValidateSpecs(options));
  });

const change = program
  .command('change')
  .description('Change lifecycle: new / start / attach / next-id / diff / finalize');

change
  .command('new')
  .description('Create a change draft (id derived from --from when omitted)')
  .argument('[id]')
  .requiredOption('--from <description>', 'description the id is derived from')
  .action((id: string | undefined, options: { from: string }) => {
    const io = makeFsIo(process.cwd());
    const result = newChange(io, { id, from: options.from });
    console.log(`${result.id}\t${result.path}`);
  });

change
  .command('start')
  .description('Bind the change to a new feature branch (clean tree + default branch gates)')
  .argument('<id>')
  .option('--branch-prefix <prefix>', 'feature branch prefix', 'sdd/')
  .action((id: string, options: { branchPrefix: string }) => {
    const git: GitLike = makeCliGit(process.cwd());
    const result = startChange(git, makeFsIo(process.cwd()), id, {
      branchPrefix: options.branchPrefix,
    });
    console.log(
      `started change \`${id}\` → branch \`${result.branch}\` (base ${result.baseBranch}@${result.baseSha.slice(0, 7)})`,
    );
  });

change
  .command('attach')
  .description('Bind the change to the current branch (no gates)')
  .argument('<id>')
  .action((id: string) => {
    const result = attachChange(makeCliGit(process.cwd()), makeFsIo(process.cwd()), id);
    console.log(`attached change \`${id}\` → branch \`${result.branch}\``);
  });

change
  .command('next-id')
  .description('Preview the derived change id for a description')
  .requiredOption('--from <description>', 'description the id is derived from')
  .action((options: { from: string }) => {
    console.log(deriveChangeId(options.from));
  });

change
  .command('diff')
  .description('Print the bound branch diff vs base')
  .argument('<id>')
  .action((id: string) => {
    console.log(changeDiff(makeCliGit(process.cwd()), makeFsIo(process.cwd()), id));
  });

change
  .command('finalize')
  .description('Merge the feature branch, archive docs, and close out with one commit')
  .argument('<id>')
  .option('--into <branch>', 'merge target override (defaults to base_branch)')
  .option('--method <method>', 'merge method: squash (default) or ff', 'squash')
  .action((id: string, options: { into?: string; method: string }) => {
    if (options.method !== 'squash' && options.method !== 'ff') {
      console.error(`invalid --method: ${options.method}`);
      process.exit(1);
    }
    const result = finalizeChange(makeCliGit(process.cwd()), makeFsIo(process.cwd()), id, {
      into: options.into,
      method: options.method,
    });
    for (const w of result.warnings) console.error(`[WARNING] ${w}`);
    console.log(
      `finalized \`${id}\` → ${result.archiveDir} (commit "${result.commitSubject}" on ${result.target})`,
    );
  });

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

await main();
