import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import {
  addReq,
  addScenario,
  hasNativeRules,
  migrateNativeSource,
  nextReqId,
  resolveReq,
  scaffoldSpec,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import { CliError, loadCliConfig, loadSpecEntries, newIo } from '../cli-shared.ts';

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
    .action((capability: string, options: { force?: boolean }) => {
      const locale = loadCliConfig()?.locale ?? 'en';
      const path = join('llmanspec', 'specs', `${capability}.feature`);
      if (!options.force && existsSync(path)) {
        throw new CliError(`spec already exists: ${path} (use --force to overwrite)`);
      }
      const written = scaffoldSpec(newIo(), 'llmanspec/specs', capability, locale, {
        force: options.force,
      });
      console.log(`wrote ${written}`);
    });

  spec
    .command('next-req-id')
    .description('Allocate the next free global req id (rN)')
    .option('--json', 'emit {reqId}')
    .action((options: { json?: boolean }) => {
      const reqId = nextReqId(newIo(), 'llmanspec/specs');
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
    .action((capability: string, reqId: string, options: { title: string; statement: string }) => {
      const io = newIo();
      const path = addReq(io, 'llmanspec/specs', loadSpecEntries(), {
        capability,
        reqId,
        title: options.title,
        statement: options.statement,
      });
      console.log(path);
    });

  spec
    .command('add-scenario')
    .description('Insert a nested 场景: under the named rule in a spec')
    .argument('<capability>')
    .argument('<req_id>')
    .argument('<scenario_id>')
    .option('--given <given>', 'Given step (optional)')
    .requiredOption('--when <when>', 'When step')
    .requiredOption('--then <then>', 'Then step')
    .action(
      (
        capability: string,
        reqId: string,
        scenarioId: string,
        options: { given?: string; when: string; then: string },
      ) => {
        const io = newIo();
        const path = addScenario(io, 'llmanspec/specs', loadSpecEntries(), {
          capability,
          reqId,
          scenarioId,
          given: options.given,
          when: options.when,
          thenText: options.then,
        });
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
    .action((reqId: string) => {
      const resolved = resolveReq(loadSpecEntries(), reqId);
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
}
