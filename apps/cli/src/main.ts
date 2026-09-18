#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  VERSION,
  attachChange,
  buildReview,
  collectChanges,
  collectSpecs,
  discoverSpecs,
  embeddedTemplates,
  graphMermaid,
  makeEmbeddedTemplateIo,
  nextReqId,
  changeDiff,
  deriveChangeId,
  finalizeChange,
  loadConfig,
  loadTree,
  newChange,
  renderChangesJson,
  runContextRetrieval,
  renderChangesList,
  renderReviewHtml,
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
  TEMPLATES_ROOT,
  resolveChatConfig,
  unavailableResult,
  type TemplateIo,
  addReq,
  addScenario,
  archiveChange,
  checkChangeDoc,
  changeDiffInfo,
  buildReqRegistry,
  expandRunCommand,
  STAGE_ORDER,
  hasPlaceholders,
  harvestUniqueNumbers,
  planDedupe,
  resolveReq,
  renderConfigOverview,
  setExtraSkills,
  skillsJson,
  ExtraSkillsError,
} from '@llman-sdd/core';
import { Command, Option } from 'commander';

import { makeCliGit, makeIo } from './io.ts';

// Injected at binary build time by scripts/build-binary.ts; falls back to the
// package version when running from source.
const version = process.env.LLMAN_SDD_VERSION ?? VERSION;

// Compiled single-file binaries have no on-disk templates and Bun <= 1.4.x has
// no embedding mechanism, so build-binary.ts injects the template table via
// define; every non-compiled run keeps reading the real filesystem (npm/source/
// Node). Both init and `review --export-html` resolve through this one seam.
const embedded = embeddedTemplates();
const templateIo: TemplateIo = embedded
  ? makeEmbeddedTemplateIo(embedded)
  : {
      exists: (p) => existsSync(p),
      readText: (p) => readFileSync(p, 'utf8'),
    };

/** Parse all capability specs under llmanspec/specs via core discovery. */
function loadSpecEntries(): ReturnType<typeof discoverSpecs> {
  return discoverSpecs('llmanspec/specs', makeIo(process.cwd()));
}

function runValidateSpecs(options: { check: boolean; quiet?: boolean }): {
  failed: boolean;
  verdicts: ReturnType<typeof validateAllSpecs>['verdicts'];
} {
  const entries = loadSpecEntries();
  const report = validateAllSpecs(entries, makeIo(process.cwd()));
  if (!options.quiet) for (const line of report.lines) console.log(line);

  let failed = report.failed;
  if (options.check && existsSync('llmanspec/config.yaml')) {
    const config = loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'));
    const runCommand = config.bdd?.run_command;
    if (runCommand) {
      if (hasPlaceholders(runCommand)) {
        // r48: per-target replacement — run once per capability spec.
        for (const entry of entries) {
          const name = entry.doc.header.capability ?? entry.fileName.replace(/\.feature$/u, '');
          const target = {
            featureDir: 'llmanspec/specs',
            featureName: name,
            featurePath: `llmanspec/specs/${entry.fileName}`,
          };
          const proc = spawnSync(expandRunCommand(runCommand, target), {
            shell: true,
            stdio: 'inherit',
          });
          if ((proc.status ?? 1) !== 0) failed = true;
        }
      } else {
        const proc = spawnSync(runCommand, { shell: true, stdio: 'inherit' });
        if ((proc.status ?? 1) !== 0) failed = true;
      }
    }
  }
  return { failed, verdicts: report.verdicts };
}

function collectRepeatable(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function loadCliConfig(): ReturnType<typeof loadConfig> | null {
  return existsSync('llmanspec/config.yaml')
    ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'))
    : null;
}

function specVerdictsToItems(
  verdicts: ReturnType<typeof validateAllSpecs>['verdicts'],
): { id: string; type: string; valid: boolean; issues: unknown[] }[] {
  return verdicts.map((v) => ({
    id: v.capability,
    type: 'spec',
    valid: v.ok,
    issues: v.items,
  }));
}

function runValidateSweep(): boolean {
  const report = validateAllSpecs(loadSpecEntries(), makeIo(process.cwd()));
  return report.verdicts.some((v) => !v.ok);
}

const program = new Command();

program.name('llman-sdd').description('Spec-driven development workflow').version(version);

program
  .command('init')
  .description('Initialize llmanspec in your project (--update to refresh existing)')
  .argument('[path]', 'target directory (created when missing; defaults to cwd)')
  .option('--update', 'refresh an existing installation')
  .option('--locale <locale>', 'locale for generated templates (defaults to config or en)')
  .option('--lang <locale>', 'alias of --locale')
  .action(
    (path: string | undefined, options: { update?: boolean; locale?: string; lang?: string }) => {
      if (options.locale !== undefined && options.lang !== undefined) {
        console.error('--locale and --lang are mutually exclusive (they are aliases)');
        process.exitCode = 1;
        return;
      }
      let root = process.cwd();
      if (path !== undefined) {
        root = resolve(path);
        mkdirSync(root, { recursive: true });
      }
      const result = runInit(makeIo(root), templateIo, {
        update: options.update ?? false,
        locale: options.locale ?? options.lang,
        version,
      });
      const removed = result.removed.length > 0 ? `, removed: ${result.removed.join(', ')}` : '';
      console.log(`initialized llmanspec (${result.skills.length} skills${removed})`);
    },
  );

program
  .command('validate')
  .description('Validate specs and changes (structural gates + stage/completion rules)')
  .argument('[item]', 'spec id or change id (auto-disambiguated)')
  .option('--all', 'validate all specs and all changes')
  .option('--changes', 'restrict scope to changes')
  .option('--specs', 'restrict scope to specs')
  .option('--type <type>', 'force disambiguation: change | spec')
  .option('--stage <stage>', 'change stage gate: draft | designed | planned | full')
  .option('--strict', 'warnings also make the exit code non-zero')
  .option('--json', 'emit {items:[{id,type,valid,issues}]}')
  .option('--compact-json', 'single-line --json (requires --json)')
  .option('--no-check', 'skip the bdd.run_command check (structural validation only)')
  .action(
    (
      item: string | undefined,
      options: {
        all?: boolean;
        changes?: boolean;
        specs?: boolean;
        type?: string;
        stage?: string;
        strict?: boolean;
        json?: boolean;
        compactJson?: boolean;
        check: boolean;
      },
    ) => {
      // Node 下管道 stdout 写入异步,process.exit 会截断输出;exitCode 等价且安全。
      if (options.compactJson && !options.json) {
        console.error('--compact-json requires --json');
        process.exitCode = 1;
        return;
      }
      if (options.type !== undefined && options.type !== 'change' && options.type !== 'spec') {
        console.error(`invalid --type: ${options.type}`);
        process.exitCode = 1;
        return;
      }
      if (
        options.stage !== undefined &&
        !(STAGE_ORDER as readonly string[]).includes(options.stage)
      ) {
        console.error(`invalid --stage: ${options.stage}`);
        process.exitCode = 1;
        return;
      }

      const specScope = options.all || !options.changes || options.specs === true;
      const changeScope = options.all || options.changes === true;
      // no item + no explicit scope flags → specs only (historical default)
      const defaultSpecsOnly = item === undefined && !options.all && !options.changes;
      const effectiveSpecs = defaultSpecsOnly ? true : specScope;
      const effectiveChanges =
        item === undefined && !options.all ? options.changes === true : changeScope;

      const jsonItems: { id: string; type: string; valid: boolean; issues: unknown[] }[] = [];
      let failed = false;

      if (item !== undefined) {
        // auto-disambiguation: spec id first (exact file stem), then change name
        const entries = loadSpecEntries();
        const specEntry =
          options.type === 'change'
            ? undefined
            : entries.find(
                (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
              );
        if (specEntry !== undefined) {
          const run = runValidateSpecs({ check: options.check, quiet: options.json === true });
          if (options.json) {
            console.log(JSON.stringify({ items: specVerdictsToItems(run.verdicts) }, null, 2));
          }
          process.exitCode = run.failed ? 1 : 0;
          return;
        }
        const changes = collectChanges(makeIo(process.cwd()), process.cwd(), new Date());
        const change = options.type === 'spec' ? undefined : changes.find((c) => c.name === item);
        if (change === undefined) {
          console.error(`no spec or change matches: ${item}`);
          process.exitCode = 1;
          return;
        }
        const config = loadCliConfig();
        const result = checkChangeDoc(change, config?.archive ?? {}, {
          stage: options.stage as never,
        });
        const hasError = result.issues.some((i) => i.level === 'ERROR');
        const hasWarning = result.issues.some((i) => i.level === 'WARNING');
        failed = hasError || (options.strict === true && hasWarning);
        for (const issue of result.issues)
          console.log(`  [${issue.level}] ${change.name}: ${issue.message}`);
        console.log(`${result.valid ? 'OK' : 'FAIL'} change/${change.name}`);
        jsonItems.push({
          id: change.name,
          type: 'change',
          valid: result.valid,
          issues: result.issues,
        });
        if (!options.json) {
          // human lines already printed
        } else {
          console.log(JSON.stringify({ items: jsonItems }, null, 2));
        }
        process.exitCode = failed ? 1 : 0;
        return;
      }

      let specVerdicts: ReturnType<typeof validateAllSpecs>['verdicts'] = [];
      if (effectiveSpecs) {
        const run = runValidateSpecs({ check: options.check, quiet: options.json === true });
        failed = run.failed;
        specVerdicts = run.verdicts;
      }
      if (effectiveChanges) {
        const config = loadCliConfig();
        const changes = collectChanges(makeIo(process.cwd()), process.cwd(), new Date());
        const skipArchive = changes.filter((c) => c.name !== 'archive');
        for (const change of skipArchive) {
          const result = checkChangeDoc(change, config?.archive ?? {}, {
            stage: options.stage as never,
          });
          const hasError = result.issues.some((i) => i.level === 'ERROR');
          const hasWarning = result.issues.some((i) => i.level === 'WARNING');
          if (hasError || (options.strict === true && hasWarning)) failed = true;
          console.log(`${result.valid ? 'OK' : 'FAIL'} change/${change.name}`);
          for (const issue of result.issues)
            console.log(`  [${issue.level}] ${change.name}: ${issue.message}`);
          jsonItems.push({
            id: change.name,
            type: 'change',
            valid: result.valid,
            issues: result.issues,
          });
        }
      }
      if (options.json) {
        const all = [...specVerdictsToItems(specVerdicts), ...jsonItems];
        const text = JSON.stringify({ items: all });
        console.log(options.compactJson ? text : JSON.stringify({ items: all }, null, 2));
      }
      process.exitCode = failed ? 1 : 0;
    },
  );

const change = program
  .command('change')
  .description('Change lifecycle: new / start / attach / next-id / diff / finalize');

change
  .command('new')
  .description('Create a change draft (exactly one of <id> or --from)')
  .argument('[id]')
  .option('--from <description>', 'description the id is derived from')
  .option('--dry-run', 'print the resulting id without creating anything')
  .action((id: string | undefined, options: { from?: string; dryRun?: boolean }) => {
    if ((id === undefined) === (options.from === undefined)) {
      console.error('<CHANGE> and --from are mutually exclusive; pass one or the other');
      process.exitCode = 1;
      return;
    }
    if (options.dryRun) {
      console.log(id ?? deriveChangeId(options.from as string));
      return;
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
  .option(
    '--branch-prefix <prefix>',
    'feature branch prefix (default: sdd.branch_prefix config, then sdd/)',
  )
  .action((id: string, options: { branchPrefix?: string }) => {
    const git = makeCliGit(process.cwd());
    const config = loadCliConfig();
    const result = startChange(git, makeIo(process.cwd()), id, {
      branchPrefix: options.branchPrefix ?? config?.sdd?.branch_prefix ?? 'sdd/',
    });
    console.log(
      `started change \`${id}\` → branch \`${result.branch}\` (base ${result.baseBranch}@${result.baseSha.slice(0, 7)})`,
    );
  });

change
  .command('attach')
  .description('Bind the change to the current feature branch')
  .argument('<id>')
  .option('--force', 'rebind an already attached change to the current branch')
  .option('--base <branch>', 'explicit fork-point branch to record')
  .action((id: string, options: { force?: boolean; base?: string }) => {
    const result = attachChange(makeCliGit(process.cwd()), makeIo(process.cwd()), id, {
      force: options.force,
      base: options.base,
    });
    console.log(
      `attached change \`${id}\` → branch \`${result.branch}\` base-branch \`${result.baseBranch}\``,
    );
  });

change
  .command('next-id')
  .description('Preview the next free change id number (read-only)')
  .option('--json', 'emit {maxNumber, nextNumber, warnings}')
  .action((options: { json?: boolean }) => {
    const harvest = harvestUniqueNumbers(
      {
        listDir: (p) => readdirSync(resolve(p)),
        isDirectory: (p) => statSync(resolve(p)).isDirectory(),
      },
      'llmanspec',
    );
    if (options.json) {
      console.log(JSON.stringify(harvest, null, 2));
      return;
    }
    if (harvest.maxNumber === null) console.log('no numbered change dirs found in tree');
    else console.log(`max number in tree: ${harvest.maxNumber}`);
    console.log(`next free number: ${harvest.nextNumber}`);
    for (const w of harvest.warnings) console.error(`warning: ${w}`);
  });

change
  .command('archive')
  .description('Independent seal-off: task gates + merge + archive rename + commit')
  .argument('<id>')
  .option('--into <branch>', 'target branch to merge into')
  .option('--method <method>', 'merge method: squash | ff')
  .option('--dry-run', 'print the rename plan only')
  .addOption(new Option('--force', 'skip task and git gates').hideHelp())
  .action(
    (
      id: string,
      options: { into?: string; method?: string; dryRun?: boolean; force?: boolean },
    ) => {
      if (options.method !== undefined && options.method !== 'squash' && options.method !== 'ff') {
        console.error(`invalid --method \`${options.method}\` (squash | ff)`);
        process.exitCode = 1;
        return;
      }
      const io = makeIo(process.cwd());
      if (options.dryRun) {
        const date = new Date().toISOString().slice(0, 10);
        console.log(
          `Would move llmanspec/changes/${id} -> llmanspec/changes/archive/${date}-${id}`,
        );
        return;
      }
      const config = existsSync('llmanspec/config.yaml')
        ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'))
        : null;
      const result = archiveChange(makeCliGit(process.cwd()), io, id, {
        into: options.into,
        method: options.method as 'squash' | 'ff' | undefined,
        force: options.force,
        minCompletionRatio: config?.archive?.min_completion_ratio ?? undefined,
      });
      console.log(
        `archived \`${id}\` → ${result.archiveDir} (commit "${result.commitSubject}" on ${result.target})`,
      );
    },
  );

change
  .command('diff')
  .description('Print the bound branch diff vs base')
  .argument('<id>')
  .option('--json', 'emit {change, branch, base, commitCount}')
  .option('--export-patch <path>', 'write the diff to a file instead of stdout')
  .action((id: string, options: { json?: boolean; exportPatch?: string }) => {
    const git = makeCliGit(process.cwd());
    if (options.json) {
      const info = changeDiffInfo(git, makeIo(process.cwd()), id);
      console.log(JSON.stringify(info, null, 2));
      return;
    }
    const diff = changeDiff(git, makeIo(process.cwd()), id);
    if (options.exportPatch !== undefined) {
      writeFileSync(options.exportPatch, diff);
      console.log(`wrote ${options.exportPatch}`);
      return;
    }
    console.log(diff);
  });

change
  .command('finalize')
  .description('Validate, merge the feature branch, archive docs, close out with one commit')
  .argument('<id>')
  .option('--into <branch>', 'merge target override (defaults to base_branch)')
  .option(
    '--method <method>',
    'merge method: squash | ff (default: sdd.merge_method config, then squash)',
  )
  .option('--no-check', 'skip the pre-merge validation sweep')
  .option('--no-commit', 'skip the close-out commit (manual/CI history)')
  .action(
    (
      id: string,
      options: { into?: string; method?: string; check?: boolean; commit?: boolean },
    ) => {
      if (options.method !== undefined && options.method !== 'squash' && options.method !== 'ff') {
        console.error(`invalid --method: ${options.method}`);
        process.exitCode = 1;
        return;
      }
      if (options.check !== false) {
        const failed = runValidateSweep();
        if (failed) {
          console.error('finalize aborted: validation sweep failed (use --no-check to skip)');
          process.exitCode = 1;
          return;
        }
      }
      const config = loadCliConfig();
      const method = options.method ?? config?.sdd?.merge_method ?? 'squash';
      const result = finalizeChange(makeCliGit(process.cwd()), makeIo(process.cwd()), id, {
        into: options.into,
        method: method as 'squash' | 'ff',
        noCommit: options.commit === false,
      });
      for (const w of result.warnings) console.error(`[WARNING] ${w}`);
      if (options.commit === false) {
        console.log(
          `finalized \`${id}\` → ${result.archiveDir} on ${result.target} (close-out commit skipped — run: git add -A && git commit -m "archive(sdd): ${id}")`,
        );
        return;
      }
      console.log(
        `finalized \`${id}\` → ${result.archiveDir} (commit "${result.commitSubject}" on ${result.target})`,
      );
    },
  );

program
  .command('list')
  .description('List changes or specs')
  .option('--specs', 'list specs instead of changes')
  .option('--json', 'machine-readable output')
  .option('--compact-json', 'single-line --json (requires --json)')
  .option('--sort <order>', 'recent (mtime desc, default) | name')
  .action((options: { specs?: boolean; json?: boolean; compactJson?: boolean; sort?: string }) => {
    if (options.compactJson && !options.json) {
      console.error('--compact-json requires --json');
      process.exitCode = 1;
      return;
    }
    if (options.sort !== undefined && options.sort !== 'recent' && options.sort !== 'name') {
      console.error(`invalid --sort: ${options.sort}`);
      process.exitCode = 1;
      return;
    }
    const emit = (text: string): void => {
      console.log(options.compactJson ? text.replaceAll('\n', '') : text);
    };
    if (options.specs) {
      const summaries = collectSpecs(loadSpecEntries());
      emit(options.json ? renderSpecsJson(summaries) : renderSpecsList(summaries).join('\n'));
      return;
    }
    let changes = collectChanges(makeIo(process.cwd()), process.cwd(), new Date());
    if (options.sort === 'name') {
      changes = [...changes].sort((a, b) => a.name.localeCompare(b.name));
    }
    emit(
      options.json ? renderChangesJson(changes) : renderChangesList(changes, new Date()).join('\n'),
    );
  });

program
  .command('show')
  .description('Show a change (JSON or text) or a spec (text)')
  .argument('<item>')
  .option('--output <format>', 'json | compact | meta-only | no-scenarios')
  .option('--type <itemType>', 'item type hint: change|spec')
  .option('-r, --requirement <n>', 'spec only: show a single requirement by 1-based index')
  .action((item: string, options: { output?: string; type?: string; requirement?: string }) => {
    if (options.output === 'deltas' || options.output === 'reqs-only') {
      console.error(
        `--output ${options.output} was removed along with the checkpoint/delta mechanism (v2 edits live specs on the bound branch)`,
      );
      process.exitCode = 1;
      return;
    }
    const isSpec =
      options.type === 'spec' || existsSync(join('llmanspec', 'specs', `${item}.feature`));
    if (isSpec) {
      const path = join('llmanspec', 'specs', `${item}.feature`);
      if (!existsSync(path)) {
        console.error(`spec not found: ${item}`);
        process.exitCode = 1;
        return;
      }
      const raw = readFileSync(path, 'utf8');
      let text = raw.trimEnd();
      if (options.requirement !== undefined) {
        const idx = Number(options.requirement);
        if (!Number.isInteger(idx) || idx < 1) {
          console.error(`invalid --requirement: ${options.requirement}`);
          process.exitCode = 1;
          return;
        }
        const entry = loadSpecEntries().find(
          (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
        );
        const rule = entry?.doc.scenarios.filter((sc) => sc.classification === 'human')[idx - 1];
        if (rule === undefined) {
          console.error(`requirement index out of range: ${idx}`);
          process.exitCode = 1;
          return;
        }
        console.log(`@req:${rule.reqIds[0] ?? ''} ${rule.name}\n${rule.statement}`);
        return;
      }
      const entry = loadSpecEntries().find(
        (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
      );
      const compact = options.output === 'compact' || options.output === 'meta-only';
      if (compact) {
        const header = entry?.doc.header;
        const lines = [
          `# capability: ${header?.capability ?? item}`,
          `# purpose: ${header?.purpose ?? ''}`,
          `# scope: ${header?.scope ?? ''}`,
        ];
        console.log(lines.join('\n'));
        if (options.output !== 'meta-only') {
          const sc = entry?.doc.scenarios.map((x) => `  ${x.classification}: ${x.name}`);
          if (sc && sc.length > 0) console.log(sc.join('\n'));
        }
        return;
      }
      if (options.output === 'no-scenarios') {
        const stripped = text
          .split('\n')
          .filter((l) => !/^\s*(场景|Scenario):/u.test(l))
          .join('\n');
        console.log(`## Spec\n${stripped}`);
        return;
      }
      const summary = collectSpecs(loadSpecEntries()).find((x) => x.id === item);
      const morphology = summary
        ? `\n\n## Morphology\nruleCount=${summary.morphology.ruleCount} enforced=${summary.morphology.ruleEnforcedCount} manual=${summary.morphology.ruleManualCount} pending=${summary.morphology.rulePendingCount} acceptanceCount=${summary.morphology.acceptanceCount}`
        : '';
      console.log(`## Spec\n${text}${morphology}`);
      return;
    }
    const proposalPath = join('llmanspec', 'changes', item, 'proposal.md');
    if (!existsSync(proposalPath)) {
      console.error(`change not found: ${item}`);
      process.exitCode = 1;
      return;
    }
    // r52 What-Changes gate (v1 parity): applies to json and text alike.
    const proposal = readFileSync(proposalPath, 'utf8');
    if (!proposal.includes('## What Changes')) {
      console.error('Change must have a What Changes section');
      process.exitCode = 1;
      return;
    }
    if (options.output === 'meta-only') {
      console.log(`path: ${join('llmanspec', 'changes', item)}`);
      return;
    }
    if (options.output !== undefined && options.output !== 'json' && options.output !== 'compact') {
      console.error(`unsupported --output for changes: ${options.output}`);
      process.exitCode = 1;
      return;
    }
    if (options.output !== 'json' && options.output !== 'compact') {
      const changes = collectChanges(makeIo(process.cwd()), process.cwd(), new Date());
      const change = changes.find((c) => c.name === item);
      console.log(`Stage: ${change?.stage ?? 'draft'}`);
      console.log(`path: ${join('llmanspec', 'changes', item)}`);
      console.log('---');
      console.log(proposal.trimEnd());
      return;
    }
    const result = showChangeJson(
      {
        io: makeIo(process.cwd()),
        git: makeCliGit(process.cwd()),
        root: process.cwd(),
        specsDir: 'llmanspec/specs',
      },
      item,
    );
    if (options.output === 'compact') {
      console.log(JSON.stringify(result));
      return;
    }
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command('graph')
  .description('Generate a change dependency graph (mermaid)')
  .option('--format <format>', 'output format', 'mermaid')
  .action((options: { format: string }) => {
    if (options.format !== 'mermaid') {
      console.error(`unsupported format: ${options.format}`);
      process.exitCode = 1;
      return;
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
  .command('dedupe-req-ids')
  .description('Remap globally duplicated req ids (report with --dry-run)')
  .option('--dry-run', 'report the remap plan without writing')
  .action((options: { dryRun?: boolean }) => {
    const registry = buildReqRegistry(loadSpecEntries());
    if (registry.duplicates.length === 0) {
      console.log('No colliding req_id values in llmanspec/specs.');
      return;
    }
    const io = makeIo(process.cwd());
    const plan = planDedupe(loadSpecEntries(), io, 'llmanspec/specs', registry.duplicates);
    if (options.dryRun) {
      console.log('Remap plan (nothing written):');
      for (const item of plan) {
        console.log(
          `  ${item.reqId}: keep ${item.keepFile}, remap ${item.remapFile} -> ${item.newReqId}`,
        );
      }
      return;
    }
    for (const item of plan) {
      console.log(`remapped ${item.reqId} in ${item.remapFile} -> ${item.newReqId}`);
    }
  });

project
  .command('migrate')
  .description('Legacy migration entry (informational only)')
  .action(() => {
    console.log('legacy 迁移实现(spec.toon / specs-flatten 等)不随本工具提供;');
    console.log(
      '本工具直接读取既有 llmanspec 布局(config.yaml / specs/*.feature / changes/),零迁移可读。',
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
      try {
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
      } catch (error) {
        // Emscripten aborts (e.g. wasm load failure) throw raw RuntimeErrors —
        // keep the CLI surface one-line like thaw does.
        console.error((error as Error).message);
        process.exitCode = 1;
      }
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
      process.exitCode = 1;
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
    const config = existsSync('llmanspec/config.yaml')
      ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'))
      : null;
    const bindings = config?.bdd?.bindings?.filter((b) => b.kind === 'tags') ?? [];
    const io = makeIo(process.cwd());
    const entries = loadSpecEntries();
    if (options.capability !== undefined) {
      const known = new Set(
        entries.map((e) => e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')),
      );
      if (!known.has(options.capability)) {
        console.error(`capability \`${options.capability}\` not found`);
        process.exitCode = 1;
        return;
      }
    }
    const activeChanges = collectChanges(io, process.cwd(), new Date());
    const result = buildReview(
      {
        entries,
        bindings: bindings.map((b) => ({ kind: 'tags', tags: b.tags })),
        boundChangeCount: activeChanges.filter((c) => c.hasBinding).length,
        activeChanges,
        capability: options.capability,
      },
      io,
    );
    if (options.exportHtml !== undefined) {
      const template = templateIo.readText(join(TEMPLATES_ROOT, 'shared', 'review.html'));
      writeFileSync(options.exportHtml, renderReviewHtml(template, result));
      console.log(`wrote ${options.exportHtml}`);
    }
    if (options.json) {
      console.log(JSON.stringify({ signals: result.signals, summary: result.summary }, null, 2));
    } else {
      console.log(result.lines.join('\n'));
    }
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
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
    const io = makeIo(process.cwd());
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
      const io = makeIo(process.cwd());
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
      console.error(`req id not found: ${reqId}`);
      process.exitCode = 1;
      return;
    }
    console.log(`reqId: ${resolved.reqId}`);
    console.log(`capability: ${resolved.capability}`);
    console.log(`title: ${resolved.title}`);
    console.log(`statement: ${resolved.statement.replaceAll('\n', ' ')}`);
    console.log('harness:');
    for (const h of resolved.harness) console.log(`  - ${h}`);
  });

const configCmd = program
  .command('config')
  .description('Project configuration commands (view/edit config.yaml)');

configCmd.description('Print a read-only llmanspec/config.yaml overview').action(() => {
  const source = readFileSync('llmanspec/config.yaml', 'utf8');
  console.log(renderConfigOverview(source).join('\n'));
});

configCmd
  .command('skills')
  .description('Manage extra_skills (non-interactive)')
  .option('--json', 'emit {enabled, available}')
  .option('--set <name>', 'enable an extra skill (repeatable)', collectRepeatable)
  .option('--unset <name>', 'disable an extra skill (repeatable)', collectRepeatable)
  .action((options: { json?: boolean; set?: string[]; unset?: string[] }) => {
    const path = 'llmanspec/config.yaml';
    if (options.json) {
      console.log(JSON.stringify(skillsJson(readFileSync(path, 'utf8')), null, 2));
      return;
    }
    if ((options.set?.length ?? 0) > 0 || (options.unset?.length ?? 0) > 0) {
      try {
        writeFileSync(path, setExtraSkills(readFileSync(path, 'utf8'), options));
      } catch (error) {
        if (error instanceof ExtraSkillsError) {
          console.error(error.message);
          process.exitCode = 1;
          return;
        }
        throw error;
      }
    }
    const { enabled, available } = skillsJson(readFileSync(path, 'utf8'));
    console.log(`enabled: ${enabled.length > 0 ? enabled.join(', ') : '(none)'}`);
    console.log(`available: ${available.join(', ')}`);
  });

const indexCmd = program
  .command('index')
  .description('Index management commands (rebuild, check freshness)');

indexCmd
  .command('rebuild')
  .description('Rebuild the pageindex tree from spec IR (no LLM)')
  .action(() => {
    const result = rebuildIndex(makeIo(process.cwd()), 'llmanspec/specs', loadSpecEntries(), {
      chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
    });
    for (const line of result.lines) console.log(line);
  });

indexCmd
  .command('check')
  .description('Check index freshness without rebuilding')
  .action(() => {
    const result = checkIndexFreshness(makeIo(process.cwd()), 'llmanspec/specs');
    for (const line of result.lines) console.log(line);
    if (!result.fresh) process.exitCode = 1;
  });

program
  .command('context')
  .description('Get specs relevant to a task (agent-oriented, pageindex agentic retrieval)')
  .option('--task <task>', 'natural language task description')
  .option('--paths <paths>', 'comma-separated file paths')
  .option('--top <n>', 'max entries per tier', '5')
  .action(async (options: { task?: string; paths?: string; top?: string }) => {
    if (!options.task && !options.paths) {
      console.error('at least one of --task or --paths is required');
      process.exitCode = 1;
      return;
    }
    const config = resolveChatConfig(process.env as Record<string, string | undefined>);
    if (config === null) {
      // v1 parity: unavailable/error JSON on stdout, exit 0.
      console.log(JSON.stringify(unavailableResult(), null, 2));
      return;
    }
    const tree = loadTree(makeIo(process.cwd()));
    if (tree === null) {
      const missing = unavailableResult();
      missing.status.qualityNote = 'index missing — run `llman-sdd index rebuild` first';
      console.log(JSON.stringify(missing, null, 2));
      return;
    }
    const result = await runContextRetrieval({
      config,
      task: options.task ?? '',
      paths: options.paths,
      top: Number(options.top),
      tree,
      readFile: (p) => readFileSync(p, 'utf8'),
      root: process.cwd(),
    });
    console.log(JSON.stringify(result, null, 2));
  });

async function main(): Promise<void> {
  await program.parseAsync(process.argv);
}

await main();
