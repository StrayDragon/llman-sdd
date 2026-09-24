import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { addReq, addScenario, nextReqId, resolveReq, scaffoldSpec } from '@llman-sdd/core';
import type { Command } from 'commander';

import { CliError, loadCliConfig, loadSpecEntries, newIo } from '../cli-shared.ts';

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
    .description('Append a @human rule scenario to a capability spec')
    .argument('<capability>')
    .argument('<req_id>')
    .requiredOption('--title <title>', 'rule title')
    .requiredOption('--statement <statement>', 'rule statement (must contain MUST/SHALL)')
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
    .description('Append an @executable acceptance scenario bound to a req')
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
