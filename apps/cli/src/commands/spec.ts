import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import {
  addReq,
  addScenario,
  buildUnboundFeed,
  hasNativeRules,
  migrateNativeSource,
  nextReqId,
  renderMachine,
  resolveReq,
  scaffoldSpec,
  type UnboundFeed,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  CliError,
  loadCliConfig,
  loadRootSpecEntries,
  newIo,
  resolveOutMode,
  resolveRootSpecsDir,
} from '../cli-shared.ts';

/** Walk paths collecting .feature files (directories recurse). */
function collectFeatureFiles(paths: string[]): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).toSorted()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.feature')) files.push(full);
    }
  };
  for (const p of paths) {
    if (!existsSync(p)) throw new CliError(`path not found: ${p}`);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
  return files;
}

function confirmInteractive(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function registerSpec(program: Command): void {
  const spec = program.command('spec').description('Spec authoring helpers');

  spec
    .command('skeleton')
    .description('Generate a single-track spec skeleton for a capability')
    .argument('<capability>')
    .option('--force', 'overwrite an existing spec file')
    .option(
      '--directory <path>',
      'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
    )
    .action((capability: string, options: { force?: boolean; directory?: string }) => {
      const locale = loadCliConfig()?.locale ?? 'en';
      const specsDir = resolveRootSpecsDir(options.directory);
      const path = join(specsDir, `${capability}.feature`);
      if (!options.force && existsSync(path)) {
        throw new CliError(`spec already exists: ${path} (use --force to overwrite)`);
      }
      const written = scaffoldSpec(newIo(), specsDir, capability, locale, {
        force: options.force,
      });
      console.log(`wrote ${written}`);
    });

  spec
    .command('next-req-id')
    .description('Allocate the next global req id (max in use + 1, rN)')
    .option('--json', 'emit {reqId}')
    .option(
      '--directory <path>',
      'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
    )
    .action((options: { json?: boolean; directory?: string }) => {
      const reqId = nextReqId(newIo(), resolveRootSpecsDir(options.directory));
      if (options.json) console.log(JSON.stringify({ reqId }, null, 2));
      else console.log(reqId);
    });

  spec
    .command('add-req')
    .alias('add-requirement')
    .description('Append a 规则: block (with @req handle) to a capability spec')
    .argument('<capability>')
    .argument('<req_id>')
    .requiredOption('--title <title>', 'rule title')
    .requiredOption('--statement <statement>', 'rule statement (free text; multiple lines via \\n)')
    .option(
      '--directory <path>',
      'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
    )
    .action(
      (
        capability: string,
        reqId: string,
        options: { title: string; statement: string; directory?: string },
      ) => {
        const io = newIo();
        const path = addReq(
          io,
          resolveRootSpecsDir(options.directory),
          loadRootSpecEntries(options.directory),
          {
            capability,
            reqId,
            title: options.title,
            statement: options.statement,
          },
        );
        console.log(path);
      },
    );

  spec
    .command('add-scenario')
    .description('Insert a nested 场景: under the named rule in a spec')
    .argument('<capability>')
    .argument('<req_id>')
    .argument('<scenario_id>')
    .option('--given <given>', 'Given step (optional)')
    .requiredOption('--when <when>', 'When step')
    .requiredOption('--then <then>', 'Then step')
    .option(
      '--directory <path>',
      'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
    )
    .action(
      (
        capability: string,
        reqId: string,
        scenarioId: string,
        options: { given?: string; when: string; then: string; directory?: string },
      ) => {
        const io = newIo();
        const path = addScenario(
          io,
          resolveRootSpecsDir(options.directory),
          loadRootSpecEntries(options.directory),
          {
            capability,
            reqId,
            scenarioId,
            given: options.given,
            when: options.when,
            thenText: options.then,
          },
        );
        console.log(path);
      },
    );

  spec
    .command('migrate-native')
    .description('Migrate legacy tag-based .feature files to the native 规则:/场景: layout')
    .argument('[paths...]', 'feature files or directories (default: llmanspec/specs)')
    .option('--dry-run', 'print the migration plan without writing')
    .option('-y, --yes', 'proceed without per-file confirmation')
    .action(async (paths: string[], options: { dryRun?: boolean; yes?: boolean }) => {
      const targets = collectFeatureFiles(paths.length > 0 ? paths : ['llmanspec/specs']);
      const io = newIo();
      let migrated = 0;
      let skipped = 0;
      for (const file of targets) {
        const source = io.readText(file);
        // already native? layout detection via the official parser
        if (hasNativeRules(source)) {
          skipped++;
          if (options.dryRun) console.log(`[skip] ${file} (already native)`);
          continue;
        }
        const result = migrateNativeSource(source);
        if (!result.ok) {
          console.error(`[error] ${file}: ${result.message}`);
          continue;
        }
        const line = `[migrate] ${file}: ${result.rules} rule(s), ${result.scenarios} scenario(s)`;
        if (options.dryRun) {
          console.log(`${line} (dry-run)`);
          migrated++;
          continue;
        }
        if (options.yes || (await confirmInteractive(`${line}. Write? (y/N) `))) {
          writeFileSync(file, result.content, 'utf8');
          console.log(line);
          migrated++;
        } else {
          console.log(`[skip] ${file} (declined)`);
        }
      }
      console.log(`migrate-native: ${migrated} file(s) migrated, ${skipped} already native`);
    });

  spec
    .command('resolve-req')
    .description('Resolve an rN to its capability and statement')
    .argument('<req_id>')
    .option(
      '--directory <path>',
      'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
    )
    .action((reqId: string, options: { directory?: string }) => {
      const resolved = resolveReq(loadRootSpecEntries(options.directory), reqId);
      if (resolved === null) {
        throw new CliError(`req id not found: ${reqId}`);
      }
      console.log(`reqId: ${resolved.reqId}`);
      console.log(`capability: ${resolved.capability}`);
      console.log(`title: ${resolved.title}`);
      console.log(`statement: ${resolved.statement.replaceAll('\n', ' ')}`);
      console.log('harness:');
      for (const h of resolved.harness) console.log(`  - ${h}`);
    });

  const unbound = spec
    .command('unbound')
    .description('List unbound requirements (no runnable nested scenario) for implementation')
    .option('--limit <N>', 'max entries to return (default 1; 0 = all)');
  addReportOutputOptions(unbound);
  unbound.action(
    (options: { limit?: string; output?: string; json?: boolean; compactJson?: boolean }) => {
      const raw = options.limit ?? '1';
      if (!/^\d+$/u.test(raw)) {
        throw new CliError(`invalid --limit: ${raw} (non-negative integer)`, 2);
      }
      const limit = Number(raw);
      const feed: UnboundFeed = buildUnboundFeed(loadRootSpecEntries(), limit);
      const mode = resolveOutMode(options.output, options.json, options.compactJson);
      if (mode !== 'human') {
        console.log(renderMachine(feed, mode));
        return;
      }
      console.log(`spec unbound: ${feed.returned} shown of ${feed.total} total`);
      for (const r of feed.requirements) {
        console.log(`  - [${r.reqId}] ${r.featurePath} :: ${r.title}`);
        for (const line of r.statement.split('\n')) console.log(`      ${line}`);
      }
      if (feed.hint !== '') console.log(feed.hint);
    },
  );
}
