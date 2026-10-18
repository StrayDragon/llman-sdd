import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import {
  DEFAULT_LOCALE,
  addReq,
  addScenario,
  buildUnboundFeed,
  hasNativeRules,
  migrateNativeSource,
  nextReqId,
  resolveReq,
  scaffoldSpec,
  TRANSITIONS_INTROSPECTION,
  type UnboundFeed,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  addSpecDirOption,
  CliError,
  loadCliConfig,
  loadRootSpecEntries,
  emitReport,
  resolveCommandRoot,
  resolveRootSpecsDir,
  type CliContext,
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

export function registerSpec(program: Command, ctx: CliContext): void {
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
      // r109/r115: locale 属命中实例根的配置,`--directory` 指向子根时不得读启动根
      const locale =
        loadCliConfig(resolveCommandRoot(ctx, options.directory))?.locale ?? DEFAULT_LOCALE;
      const specsDir = resolveRootSpecsDir(options.directory, ctx.io);
      const path = join(specsDir, `${capability}.feature`);
      if (!options.force && existsSync(path)) {
        throw new CliError(`spec already exists: ${path} (use --force to overwrite)`);
      }
      const written = scaffoldSpec(ctx.io, specsDir, capability, locale, {
        force: options.force,
      });
      console.log(`wrote ${written}`);
    });

  const nextReq = spec
    .command('next-req-id')
    .description('Allocate the next global req id (max in use + 1, rN)');
  addReportOutputOptions(nextReq, { outputHint: 'json {reqId}; toon default' });
  addSpecDirOption(nextReq);
  nextReq.action(
    (options: { json?: boolean; output?: string; compactJson?: boolean; directory?: string }) => {
      const reqId = nextReqId(ctx.io, resolveRootSpecsDir(options.directory, ctx.io));
      emitReport({ reqId }, options, () => reqId);
    },
  );

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
        const io = ctx.io;
        const path = addReq(
          io,
          resolveRootSpecsDir(options.directory, ctx.io),
          loadRootSpecEntries(options.directory, ctx.io),
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
        const io = ctx.io;
        const path = addScenario(
          io,
          resolveRootSpecsDir(options.directory, ctx.io),
          loadRootSpecEntries(options.directory, ctx.io),
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

  const migrateNative = spec
    .command('migrate-native')
    .description('Migrate legacy tag-based .feature files to the native 规则:/场景: layout')
    .argument('[paths...]', 'feature files or directories (default: llmanspec/specs)')
    .option('--dry-run', 'print the migration plan without writing')
    .option('-y, --yes', 'proceed without per-file confirmation');
  addSpecDirOption(migrateNative);
  migrateNative.action(
    async (paths: string[], options: { dryRun?: boolean; yes?: boolean; directory?: string }) => {
      // r116: 显式传入的路径按参数原义处理(豁免);缺省目标才经根发现算子
      const targets = collectFeatureFiles(
        paths.length > 0 ? paths : [resolveRootSpecsDir(options.directory, ctx.io)],
      );
      const io = ctx.io;
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
    },
  );

  spec
    .command('resolve-req')
    .description('Resolve an rN to its capability and statement')
    .argument('<req_id>')
    .option(
      '--directory <path>',
      'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
    )
    .action((reqId: string, options: { directory?: string }) => {
      const resolved = resolveReq(loadRootSpecEntries(options.directory, ctx.io), reqId);
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

  const transitions = spec
    .command('transitions')
    .description('Show transition-table validation rules: alias families, tags, gates');
  addSpecDirOption(transitions);
  transitions.action((options: { directory?: string }) => {
    // r109: 本命令输出为静态内省,无实例根语义;仍按「豁免外全部命令声明并接受
    // --directory」声明该选项,并仅在显式给出时经同一根发现算子校验(无实例报域错误)。
    if (options.directory !== undefined) resolveCommandRoot(ctx, options.directory);
    const info = TRANSITIONS_INTROSPECTION;
    console.log('columns:');
    for (const fam of info.columnFamilies) {
      const optional = 'optional' in fam && fam.optional ? ' (optional)' : '';
      console.log(`  ${fam.role}${optional}: ${fam.aliases.join(' | ')}`);
    }
    console.log(`discovery: ${info.discovery}`);
    console.log('tags:');
    for (const t of info.tags) console.log(`  ${t.tag} — ${t.semantics}`);
    console.log('gates:');
    for (const g of info.gates) console.log(`  - ${g}`);
  });

  const unbound = spec
    .command('unbound')
    .description('List unbound requirements (no runnable nested scenario) for implementation')
    .option('--limit <N>', 'max entries to return (default 1; 0 = all)');
  addReportOutputOptions(unbound);
  addSpecDirOption(unbound);
  unbound.action(
    (options: {
      limit?: string;
      output?: string;
      json?: boolean;
      compactJson?: boolean;
      directory?: string;
    }) => {
      const raw = options.limit ?? '1';
      if (!/^\d+$/u.test(raw)) {
        throw new CliError(`invalid --limit: ${raw} (non-negative integer)`, 2);
      }
      const limit = Number(raw);
      const feed: UnboundFeed = buildUnboundFeed(
        loadRootSpecEntries(options.directory, ctx.io),
        limit,
      );
      emitReport(feed, options, () => {
        const lines = [`spec unbound: ${feed.returned} shown of ${feed.total} total`];
        for (const r of feed.requirements) {
          lines.push(`  - [${r.reqId}] ${r.featurePath} :: ${r.title}`);
          for (const line of r.statement.split('\n')) lines.push(`      ${line}`);
        }
        if (feed.hint !== '') lines.push(feed.hint);
        return lines.join('\n');
      });
    },
  );
}
