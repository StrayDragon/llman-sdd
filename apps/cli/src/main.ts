#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  VERSION,
  attachChange,
  buildReview,
  collectChanges,
  collectSpecs,
  graphMermaid,
  nextReqId,
  changeDiff,
  deriveChangeId,
  finalizeChange,
  loadConfig,
  loadTree,
  newChange,
  parseCapability,
  renderChangesJson,
  runContextRetrieval,
  renderChangesList,
  renderSpecsJson,
  renderSpecsList,
  runInit,
  scaffoldSpec,
  showChangeJson,
  startChange,
  makeWasmSevenZip,
  checkIndexFreshness,
  rebuildIndex,
  runFreeze,
  runList,
  runThaw,
  validateAllSpecs,
  type TagBinding,
  type GitLike,
  resolveChatConfig,
  unavailableResult,
} from '@llman-sdd/core';
import { Command } from 'commander';

import { makeCliGit, makeIo } from './io.ts';

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

function runValidateSpecs(options: { specs?: boolean; check: boolean }): number {
  const entries = collectFeatureFiles('llmanspec/specs').map((path) => ({
    fileName: path,
    doc: parseCapability(readFileSync(path, 'utf8'), path),
  }));
  const report = validateAllSpecs(entries, makeIo(process.cwd()));
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

program.name('llman-sdd').description('Spec-driven development workflow').version(version);

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
  .description('Validate specs under llmanspec/specs (structural gates)')
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
  .description('Create a change draft (exactly one of <id> or --from)')
  .argument('[id]')
  .option('--from <description>', 'description the id is derived from')
  .action((id: string | undefined, options: { from?: string }) => {
    if ((id === undefined) === (options.from === undefined)) {
      console.error('<CHANGE> and --from are mutually exclusive; pass one or the other');
      process.exit(1);
    }
    const io = makeIo(process.cwd());
    const result = newChange(io, { id, from: options.from });
    if (options.from !== undefined) console.log(`derived change id: ${result.id}`);
    console.log(result.path);
  });

change
  .command('start')
  .description('Bind the change to a new feature branch (clean tree + default branch gates)')
  .argument('<id>')
  .option('--branch-prefix <prefix>', 'feature branch prefix', 'sdd/')
  .action((id: string, options: { branchPrefix: string }) => {
    const git: GitLike = makeCliGit(process.cwd());
    const result = startChange(git, makeIo(process.cwd()), id, {
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
    const result = attachChange(makeCliGit(process.cwd()), makeIo(process.cwd()), id);
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
    console.log(changeDiff(makeCliGit(process.cwd()), makeIo(process.cwd()), id));
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
    const result = finalizeChange(makeCliGit(process.cwd()), makeIo(process.cwd()), id, {
      into: options.into,
      method: options.method,
    });
    for (const w of result.warnings) console.error(`[WARNING] ${w}`);
    console.log(
      `finalized \`${id}\` → ${result.archiveDir} (commit "${result.commitSubject}" on ${result.target})`,
    );
  });

program
  .command('list')
  .description('List changes or specs')
  .option('--specs', 'list specs instead of changes')
  .option('--json', 'machine-readable output')
  .action((options: { specs?: boolean; json?: boolean }) => {
    if (options.specs) {
      const entries = collectFeatureFiles('llmanspec/specs').map((path) => ({
        fileName: path,
        doc: parseCapability(readFileSync(path, 'utf8'), path),
      }));
      const summaries = collectSpecs(entries);
      console.log(
        options.json ? renderSpecsJson(summaries) : renderSpecsList(summaries).join('\n'),
      );
      return;
    }
    const changes = collectChanges(makeIo(process.cwd()), process.cwd(), new Date());
    console.log(
      options.json ? renderChangesJson(changes) : renderChangesList(changes, new Date()).join('\n'),
    );
  });

program
  .command('show')
  .description('Show a change (JSON) or a spec (text)')
  .argument('<item>')
  .option('--output <format>', 'output format: json, meta-only, reqs-only, no-scenarios')
  .option('--type <itemType>', 'item type hint: change|spec')
  .action((item: string, options: { output?: string; type?: string }) => {
    const isSpec =
      options.type === 'spec' || existsSync(join('llmanspec', 'specs', `${item}.feature`));
    if (isSpec) {
      const path = join('llmanspec', 'specs', `${item}.feature`);
      if (!existsSync(path)) {
        console.error(`spec not found: ${item}`);
        process.exit(1);
      }
      const entries = collectFeatureFiles('llmanspec/specs').map((specPath) => ({
        fileName: specPath,
        doc: parseCapability(readFileSync(specPath, 'utf8'), specPath),
      }));
      const summary = collectSpecs(entries).find((x) => x.id === item);
      const morphology = summary
        ? `\n\n## Morphology\nruleCount=${summary.morphology.ruleCount} enforced=${summary.morphology.ruleEnforcedCount} manual=${summary.morphology.ruleManualCount} pending=${summary.morphology.rulePendingCount} acceptanceCount=${summary.morphology.acceptanceCount}`
        : '';
      console.log(`## Spec\n${readFileSync(path, 'utf8').trimEnd()}${morphology}`);
      return;
    }
    if (options.output !== 'json') {
      console.error('only --output json is supported for changes (text format pending)');
      process.exit(1);
    }
    const io = makeIo(process.cwd());
    const result = showChangeJson(
      {
        io,
        discovery: makeIo(process.cwd()),
        root: process.cwd(),
        specsDir: 'llmanspec/specs',
        now: new Date(),
      },
      item,
    );
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command('graph')
  .description('Generate a change dependency graph (mermaid)')
  .option('--format <format>', 'output format', 'mermaid')
  .action((options: { format: string }) => {
    if (options.format !== 'mermaid') {
      console.error(`unsupported format: ${options.format}`);
      process.exit(1);
    }
    console.log(graphMermaid(makeIo(process.cwd()), process.cwd()).join('\n'));
  });

const spec = program.command('spec').description('Spec authoring helpers');

spec
  .command('skeleton')
  .description('Generate a single-track spec skeleton for a capability')
  .argument('<capability>')
  .action((capability: string) => {
    const locale = existsSync('llmanspec/config.yaml')
      ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8')).locale
      : 'en';
    const path = scaffoldSpec(makeIo(process.cwd()), 'llmanspec/specs', capability, locale);
    console.log(`wrote ${path}`);
  });

spec
  .command('next-req-id')
  .description('Allocate the next free global req id (rN)')
  .action(() => {
    console.log(nextReqId(makeIo(process.cwd()), 'llmanspec/specs'));
  });

const project = program.command('project').description('Project management commands');

project
  .command('migrate')
  .description('Legacy migration entry (no-op in v2)')
  .action(() => {
    console.log(
      'v2 不携带 legacy 迁移实现:spec.toon / specs-flatten 等迁移请使用 v1(Rust llman <= 0.0.x),',
    );
    console.log(
      '例如 `cargo install llman@0.0.77 --features` 后运行 `llman sdd project migrate --kind toon2features --yes`。',
    );
    console.log(
      'v2 直接读取 v1 的 llmanspec 布局(config.yaml / specs/*.feature / changes/),零迁移可读。',
    );
  });

const archive = program
  .command('archive')
  .description(
    'Archive workflow commands (cold backup). Prefer `change finalize` to seal a change',
  );

archive
  .command('freeze')
  .description('Freeze dated archived changes into a single 7z cold backup')
  .option('--before <date>', 'freeze entries older than this date (YYYY-MM-DD)')
  .option('--keep-recent <n>', 'keep N most recent candidates unfrozen', '0')
  .option('--dry-run', 'list candidates without freezing')
  .option('--list', 'list entries already in the cold-backup archive')
  .action(
    async (options: { before?: string; keepRecent: string; dryRun?: boolean; list?: boolean }) => {
      const sz = await makeWasmSevenZip();
      const root = process.cwd();
      const io = makeIo(root);
      if (options.list) {
        for (const line of await runList(io, sz, root)) console.log(line);
        return;
      }
      const result = await runFreeze(io, sz, root, {
        before: options.before,
        keepRecent: Number(options.keepRecent),
        dryRun: options.dryRun,
      });
      for (const line of result.lines) console.log(line);
    },
  );

archive
  .command('thaw')
  .description('Restore archived change directories from the cold-backup archive')
  .requiredOption(
    '--change <name>',
    'archived change directory to restore (repeatable)',
    (v: string, prev: string[]) => {
      prev.push(v);
      return prev;
    },
    [] as string[],
  )
  .action(async (options: { change: string[] }) => {
    const sz = await makeWasmSevenZip();
    const root = process.cwd();
    const io = makeIo(root);
    try {
      const result = await runThaw(io, sz, root, options.change);
      for (const line of result.lines) console.log(line);
    } catch (error) {
      console.error((error as Error).message);
      process.exit(1);
    }
  });

const review = program
  .command('review')
  .description('Aggregate review: pending/manual/unbound/stale signals plus a validate sweep');

review
  .option('--capability <capability>', 'restrict the sweep to one capability/spec id')
  .option('--json', 'emit structured JSON (signals + summary)')
  .option('--export-html <path>', 'write a self-contained HTML report')
  .action((options: { capability?: string; json?: boolean; exportHtml?: string }) => {
    const entries = collectFeatureFiles('llmanspec/specs').map((path) => ({
      fileName: path,
      doc: parseCapability(readFileSync(path, 'utf8'), path),
    }));
    const config = existsSync('llmanspec/config.yaml')
      ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'))
      : null;
    const bindings = config?.bdd?.bindings?.filter((b) => b.kind === 'tags') ?? [];
    const changeIo = makeIo(process.cwd());
    const boundCount = collectChanges(changeIo, process.cwd(), new Date()).filter(
      (c) => c.hasBinding,
    ).length;
    const activeChanges = collectChanges(changeIo, process.cwd(), new Date());
    const result = buildReview(
      {
        entries,
        bindings: bindings as TagBinding[],
        boundChangeCount: boundCount,
        activeChanges,
      },
      makeIo(process.cwd()),
    );
    if (options.exportHtml !== undefined) {
      writeFileSync(options.exportHtml, renderReviewHtml(result));
      console.log(`wrote ${options.exportHtml}`);
    }
    if (options.json) {
      console.log(JSON.stringify({ signals: result.signals, summary: result.summary }, null, 2));
    } else {
      console.log(result.lines.join('\n'));
    }
    if (result.exitCode !== 0) process.exit(result.exitCode);
  });

/** Self-contained HTML report via the v1 shared/review.html template. */
function renderReviewHtml(result: {
  signals: { kind: string; capability: string; count: number; detail: string }[];
  summary: { criticalCount: number; warningCount: number };
}): string {
  // main.ts sits at <root>/apps/cli/src — three levels up is the repo root.
  const templatePath = join(
    import.meta.dirname ?? '.',
    '..',
    '..',
    '..',
    'packages',
    'core',
    'templates',
    'shared',
    'review.html',
  );
  const template = readFileSync(templatePath, 'utf8');
  const esc = (input: string): string =>
    input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  let mermaid = 'graph TD\n';
  const sigJson: unknown[] = [];
  result.signals.forEach((s, idx) => {
    const label = esc(
      `${s.capability} [${s.kind}] = ${s.count} — ${s.detail === '' ? 'ok' : s.detail}`,
    );
    mermaid += `    s${idx}["${label}"]\n`;
    sigJson.push({ kind: s.kind, capability: s.capability, count: s.count, detail: s.detail });
  });
  return template
    .replaceAll('__CRITICAL__', String(result.summary.criticalCount))
    .replaceAll('__WARNING__', String(result.summary.warningCount))
    .replaceAll('__SIGNALS__', JSON.stringify(sigJson))
    .replaceAll('__MERMAID__', mermaid)
    .replaceAll('__GENERATED__', new Date().toISOString());
}

const indexCmd = program
  .command('index')
  .description('Index management commands (rebuild, check freshness)');

indexCmd
  .command('rebuild')
  .description('Rebuild the pageindex tree from spec IR (no LLM)')
  .action(() => {
    const indexIo = makeIo(process.cwd());
    const entries = collectFeatureFiles('llmanspec/specs').map((path) => ({
      fileName: path,
      doc: parseCapability(readFileSync(path, 'utf8'), path),
    }));
    const result = rebuildIndex(indexIo, process.cwd(), 'llmanspec/specs', entries, {
      chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
    });
    for (const line of result.lines) console.log(line);
  });

indexCmd
  .command('check')
  .description('Check index freshness without rebuilding')
  .action(() => {
    const result = checkIndexFreshness(makeIo(process.cwd()), process.cwd(), 'llmanspec/specs');
    for (const line of result.lines) console.log(line);
    if (!result.fresh) process.exit(1);
  });

program
  .command('context')
  .description('Get specs relevant to a task (agent-oriented, pageindex agentic retrieval)')
  .option('--task <task>', 'natural language task description')
  .option('--paths <paths>', 'comma-separated file paths')
  .option('--top <n>', 'max entries per tier', '5')
  .action((options: { task?: string; paths?: string; top?: string }) => {
    if (!options.task && !options.paths) {
      console.error('at least one of --task or --paths is required');
      process.exit(1);
    }
    const config = resolveChatConfig(process.env as Record<string, string | undefined>);
    if (config === null) {
      // v1 parity: unavailable/error JSON on stdout, exit 0.
      console.log(JSON.stringify(unavailableResult(), null, 2));
      return;
    }
    const tree = loadTree(makeIo(process.cwd()), process.cwd());
    if (tree === null) {
      const missing = unavailableResult();
      missing.status.qualityNote = 'index missing — run `llman-sdd index rebuild` first';
      console.log(JSON.stringify(missing, null, 2));
      return;
    }
    void runContextRetrieval({
      config,
      task: options.task ?? '',
      paths: options.paths,
      top: Number(options.top),
      tree,
      readFile: (p) => readFileSync(p, 'utf8'),
      root: process.cwd(),
    }).then((resolved) => {
      console.log(JSON.stringify(resolved, null, 2));
    });
  });

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

await main();
