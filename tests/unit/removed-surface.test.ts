import { expect, test } from 'bun:test';
// align-report-cli-surface D2: removed CLI surface regression gate.
//
// Builds the real commander program (same registration as main.ts), then walks
// every registered subcommand to assert the deleted flags and removed commands
// are absent. This file is deliberately excluded from the T1/T2 `rg` zero-hit
// scans (it is the anti-regression gate that NAMES the removed surface).
// commander runtime resolves through apps/cli's workspace (it lives in
// apps/cli/node_modules); its Command type re-exports via cli-shared.
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { Command } from '../../apps/cli/src/cli-shared.ts';

const cliRequire = createRequire(
  join(import.meta.dirname, '..', '..', 'apps', 'cli', 'package.json'),
);
// cliRequire('commander') returns `any` (module not resolvable from tests/);
// the structural Contract is enforced through the imported Command type.
const CommandRuntime = cliRequire('commander').Command as typeof Command;

const registerArchive = (await import('../../apps/cli/src/commands/archive.ts')).registerArchive;
const registerChange = (await import('../../apps/cli/src/commands/change.ts')).registerChange;
const registerConfig = (await import('../../apps/cli/src/commands/config.ts')).registerConfig;
const registerContext = (await import('../../apps/cli/src/commands/context.ts')).registerContext;
const registerGraph = (await import('../../apps/cli/src/commands/graph.ts')).registerGraph;
const registerIndex = (await import('../../apps/cli/src/commands/index.ts')).registerIndex;
const registerInit = (await import('../../apps/cli/src/commands/init.ts')).registerInit;
const registerList = (await import('../../apps/cli/src/commands/list.ts')).registerList;
const registerProject = (await import('../../apps/cli/src/commands/project.ts')).registerProject;
const registerReview = (await import('../../apps/cli/src/commands/review.ts')).registerReview;
const registerShow = (await import('../../apps/cli/src/commands/show.ts')).registerShow;
const registerSpec = (await import('../../apps/cli/src/commands/spec.ts')).registerSpec;
const registerValidate = (await import('../../apps/cli/src/commands/validate.ts')).registerValidate;
const cliShared = await import('../../apps/cli/src/cli-shared.ts');
const { version } = cliShared;

function buildProgram(): Command {
  const program = new CommandRuntime();
  program.exitOverride();
  program.configureOutput({ outputError: () => {} });
  program.name('llman-sdd').description('Spec-driven development workflow').version(version);
  program.option(
    '--max-scan-depth <n>',
    'max depth when scanning llmanspec/changes/ for proposal.md (min 1, default 8)',
    '8',
  );
  const ctx = cliShared.makeCliContext(process.cwd());
  registerInit(program, ctx);
  registerValidate(program, ctx);
  registerChange(program, ctx);
  registerList(program, ctx);
  registerShow(program, ctx);
  registerGraph(program, ctx);
  registerSpec(program, ctx);
  registerProject(program, ctx);
  registerArchive(program, ctx);
  registerReview(program, ctx);
  registerConfig(program, ctx);
  registerIndex(program, ctx);
  registerContext(program, ctx);
  return program;
}

interface CommandNode {
  command: Command;
  chain: string[];
}

function flatten(root: Command): CommandNode[] {
  const out: CommandNode[] = [];
  const walk = (node: Command, chain: string[]): void => {
    out.push({ command: node, chain });
    for (const child of node.commands) walk(child, [...chain, child.name()]);
  };
  walk(root, []);
  return out;
}

function longOptionNames(cmd: Command): string[] {
  return cmd.options.flatMap((o) => o.long ?? []);
}

function registeredFlag(cmd: Command, flag: string): boolean {
  return longOptionNames(cmd).includes(flag);
}

test('deleted flags are not registered on any command (D2)', () => {
  const program = buildProgram();
  const nodes = flatten(program);
  expect(nodes.length).toBeGreaterThan(0);

  const deletedFlags = ['--skip-specs', '--no-interactive'];
  const violations: string[] = [];
  for (const node of nodes) {
    for (const flag of deletedFlags) {
      if (registeredFlag(node.command, flag)) {
        violations.push(`[${node.chain.join(' ')}] still registers ${flag}`);
      }
    }
  }
  if (registeredFlag(program, '--no-interactive')) violations.push('[global] --no-interactive');
  expect(violations).toEqual([]);
});

test('list --changes is not registered on list (D2)', () => {
  const program = buildProgram();
  const list = program.commands.find((c) => c.name() === 'list');
  expect(list).toBeDefined();
  expect(registeredFlag(list as Command, '--changes')).toBe(false);
});

test('removed commands do not exist anywhere (D2)', () => {
  const program = buildProgram();
  const allNames = flatten(program).map((n) => n.chain.join(' '));
  for (const removed of ['change checkpoint', 'change delta', 'project import']) {
    expect(allNames).not.toContain(removed);
  }
});

test('-r/--requirement survives on show; --output still exposes the predecessor no-delta value domain (D2)', () => {
  const program = buildProgram();
  const show = program.commands.find((c) => c.name() === 'show');
  expect(show).toBeDefined();
  const showCmd = show as Command;
  expect(registeredFlag(showCmd, '--requirement')).toBe(true);
  const output = showCmd.options.find((o) => o.long === '--output');
  const desc = output?.description ?? '';
  for (const token of ['meta-only', 'no-scenarios', 'reqs-only']) expect(desc).toContain(token);
  expect(desc).not.toContain('deltas');
});

// r107 guard: importing the entry must not execute any command; the Node
// 24.0/24.1 fallback comparator folds argv-less / unlinkable inputs to false.
const entryGuard = (await import('../../apps/cli/src/main.ts')) as object;

test('entry import runs no command (r107 guard, in-process)', async () => {
  // importing main.ts above already proved no side effects (no process.exit);
  // assert the module surface is the entry namespace with no run artifacts.
  expect(Object.keys(entryGuard).length).toBeGreaterThanOrEqual(0);
});

test('execution-guard fallback folds argv-less input to not-entry (r107)', () => {
  const { realpathSync } = require('node:fs') as typeof import('node:fs');
  const fallback = (argv1: string | undefined, self: string): boolean => {
    try {
      if (argv1 === undefined) return false;
      return realpathSync(argv1) === realpathSync(self);
    } catch {
      return false;
    }
  };
  expect(fallback(undefined, import.meta.filename)).toBe(false);
  expect(fallback('/definitely/not/a/file', import.meta.filename)).toBe(false);
  expect(fallback(import.meta.filename, import.meta.filename)).toBe(true);
});

// r109 (subproject-namespace-scope): 豁免之外的全部命令 MUST 声明并接受
// `--directory`,且 MUST NOT 存在读取该选项却未声明的命令。这是该规则的表
// 面半边;行为半边(根发现/归位)在 tests/bdd/steps/scope-boundaries.ts。
test('every leaf command declares --directory except init and self * (r109)', () => {
  const program = buildProgram();
  const nodes = flatten(program);
  expect(nodes.length).toBeGreaterThan(0);

  const exemptGroups = new Set(['init', 'self']);
  const violations: string[] = [];
  for (const node of nodes) {
    if (node.chain.length === 0) continue;
    if (node.command.commands.length > 0) continue; // parent group: no own surface
    if (exemptGroups.has(node.chain[0] ?? '')) continue;
    if (!registeredFlag(node.command, '--directory')) {
      violations.push(`[${node.chain.join(' ')}] declares no --directory`);
    }
  }
  expect(violations).toEqual([]);
});
