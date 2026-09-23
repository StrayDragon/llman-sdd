#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  VERSION,
  attachChange,
  buildReview,
  collectChanges,
  collectSpecs,
  currentBranch,
  defaultBranch,
  discoverSpecs,
  embeddedTemplates,
  graphData,
  graphMermaid,
  loadTreeWithAutoRebuild,
  makeEmbeddedTemplateIo,
  migrateNoteFor,
  migrateOverviewFor,
  morphologyOfScenarios,
  nextReqId,
  changeDiff,
  deriveChangeId,
  finalizeChange,
  loadConfig,
  newChange,
  renderChangesJson,
  runContextRetrieval,
  renderChangesList,
  renderReviewHtml,
  renderSpecsJson,
  renderSpecsList,
  resolveChangeId,
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
  validateCapability,
  TEMPLATES_ROOT,
  resolveChatConfig,
  unavailableResult,
  type TemplateIo,
  addReq,
  addScenario,
  archiveChange,
  validateChange,
  applyStrict,
  evaluateStaleness,
  buildReqRegistry,
  splitVerb,
  notApplicableStaleness,
  compileChangeIdPattern,
  renderChangeIdTemplate,
  nextUniqueNumber,
  changeDiffInfo,
  STAGE_ORDER,
  harvestUniqueNumbers,
  planDedupe,
  resolveReq,
  renderConfigOverview,
  renderMachine,
  skillsJson,
  type StalenessInfo,
  type ChangeIssue,
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

/** CLI io rooted at the launch cwd; call at action time so cwd is read per command. */
function newIo(): ReturnType<typeof makeIo> {
  return makeIo(process.cwd());
}

/** Parse all capability specs under llmanspec/specs via core discovery. */
function loadSpecEntries(): ReturnType<typeof discoverSpecs> {
  return discoverSpecs('llmanspec/specs', newIo());
}

/**
 * Config read WITHOUT the change_id.pattern compile-check, shared by
 * `change archive`, `spec skeleton`, and `review`. Those commands never render
 * change ids, so unlike loadCliConfig() an invalid change_id.pattern must not
 * abort them (v1 behavior) — do not swap these call sites to loadCliConfig().
 */
function loadCliConfigUnchecked(): ReturnType<typeof loadConfig> | null {
  return existsSync('llmanspec/config.yaml')
    ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'))
    : null;
}

function loadCliConfig(): ReturnType<typeof loadConfig> | null {
  const config = loadCliConfigUnchecked();
  if (config !== null) compileChangeIdPattern(config.change_id?.pattern);
  return config;
}

function cliMaxScanDepth(): number {
  const raw = program.opts().maxScanDepth as string | undefined;
  const n = raw !== undefined ? Number(raw) : 8;
  if (!Number.isInteger(n) || n < 1) {
    console.error(`Error: --max-scan-depth must be >= 1 (got ${raw})`);
    process.exit(1);
  }
  return n;
}

/**
 * r61: shared v1-r112 change id resolution for every change-taking command.
 * Emits the `(prefix match)` hint on stderr and exits with the resolver's
 * error message when resolution fails; returns null after reporting.
 */
function resolveChangeIdOrExit(
  input: string,
  opts: { suppressHint?: boolean } = {},
): { id: string; viaPrefix: boolean } | null {
  try {
    const resolved = resolveChangeId(newIo(), process.cwd(), input, {
      maxScanDepth: cliMaxScanDepth(),
    });
    if (resolved.viaPrefix && opts.suppressHint !== true) {
      console.error(`'${input}' -> '${resolved.id}' (prefix match)`);
    }
    return resolved;
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
    return null;
  }
}

/** r63: default-branch dirty live specs — workspace-level guard, once per run. */
function warnDirtySpecsOnDefaultBranch(): void {
  const git = makeCliGit(process.cwd());
  const current = currentBranch(git);
  if (current === null || current !== defaultBranch(git)) return;
  const out = git.runOpt(['status', '--porcelain', '--', 'llmanspec/specs']) ?? '';
  if (out.trim() === '') return;
  console.error(
    `[WARNING] llmanspec/specs: live specs dirty on default branch \`${current}\`: do not commit unimplemented contracts to the default branch. Switch to the change's bound branch (or \`llman-sdd change start <id>\`) before editing llmanspec/specs/.`,
  );
}

function runValidateSweep(): boolean {
  const report = validateAllSpecs(loadSpecEntries(), newIo());
  return report.verdicts.some((v) => !v.ok);
}

const SKILL_DESCRIPTIONS: Record<string, string> = {
  'llman-sdd-continue': 'Fill in missing change artifacts',
  'llman-sdd-ff': 'Fast-forward propose: planning shell → Branch binding → Specs landing',
  'llman-sdd-validate': 'Standalone validation skill',
  'llman-sdd-arch-review': 'Scan shallow modules for deepening candidates',
  'llman-sdd-wayfinder': 'Plan large foggy work as a decision map',
  'llman-sdd-research': 'Delegate external research to a background agent',
};
const skillDesc = (name: string): string => SKILL_DESCRIPTIONS[name] ?? '';

const program = new Command();

// v1/clap parity for arg-parsing errors: `error: unexpected argument ...` rc=2.
// Must run before subcommand registration (children copy _exitCallback at
// creation time); exitOverride turns commander's process.exit into a throw.
program.exitOverride();
program.configureOutput({ outputError: () => {} });

program.name('llman-sdd').description('Spec-driven development workflow').version(version);
program.option(
  '--max-scan-depth <n>',
  'max depth when scanning llmanspec/changes/ for proposal.md (min 1, default 8)',
  '8',
);
// v1 global flag surface parity: accepted everywhere; v2 has no interactive
// prompts to disable, so it is a no-op.
program.option('--no-interactive', 'disable interactive prompts (accepted for v1 parity)');

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

interface VItem {
  id: string;
  type: string;
  valid: boolean;
  issues: ChangeIssue[];
  durationMs: number;
  staleness: StalenessInfo;
  matchedViaPrefix: boolean;
}

/** v1 validate ordering: id asc, tie-broken by type asc. */
function compareItems(a: VItem, b: VItem): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : a.type.localeCompare(b.type);
}

function specV1Items(opts: { strict?: boolean }): VItem[] {
  const io = newIo();
  const git = makeCliGit(process.cwd());
  const entries = discoverSpecs('llmanspec/specs', io);
  const registry = buildReqRegistry(entries);
  const duplicateIds = new Set(registry.duplicates.flatMap((d) => d.reqId));
  const structurallyClean = entries.every((e) => e.doc.errors.length === 0);
  const duplicatesFor = (reqId: string): boolean => structurallyClean && duplicateIds.has(reqId);

  const items: VItem[] = [];
  for (const entry of entries) {
    const cap = entry.doc.header.capability ?? entry.fileName.replace(/\.feature$/u, '');
    const verdict = validateCapability(entry as never, duplicatesFor, io, {
      strict: opts.strict === true,
    });
    const specRel = entry.fileName.startsWith('llmanspec/')
      ? entry.fileName
      : `llmanspec/specs/${entry.fileName}`;
    const staleness = evaluateStaleness({
      git,
      root: process.cwd(),
      specRel,
      scope: entry.doc.header.scope?.split(',').map((s) => s.trim()) ?? [],
      baseRefEnv: process.env.LLMANSPEC_BASE_REF,
    });
    let issues: ChangeIssue[] = verdict.items.map((i) => ({
      level: i.level,
      path: i.id,
      message: i.message,
    }));
    if (opts.strict === true) issues = [...issues, ...applyStrict(staleness.issues)];
    else issues = [...issues, ...staleness.issues];
    items.push({
      id: cap,
      type: 'spec',
      valid: issues.every((i) => i.level !== 'ERROR'),
      issues,
      durationMs: 0,
      staleness: staleness.info,
      matchedViaPrefix: false,
    });
  }
  items.sort(compareItems);
  return items;
}

function changeV1Items(names: string[], opts: { stage?: string; strict?: boolean }): VItem[] {
  const io = newIo();
  const git = makeCliGit(process.cwd());
  const config = loadCliConfig();
  const items: VItem[] = [];
  for (const name of names) {
    const res = validateChange(
      io,
      process.cwd(),
      name,
      {
        strict_defer: config?.archive?.strict_defer ?? null,
        min_completion_ratio: config?.archive?.min_completion_ratio ?? null,
        change_id_pattern: config?.change_id?.pattern ?? null,
      },
      { stage: opts.stage as never, strict: opts.strict === true, git },
    );
    items.push({
      id: name,
      type: 'change',
      valid: res.valid,
      issues: res.issues,
      durationMs: 0,
      staleness: notApplicableStaleness(),
      matchedViaPrefix: false,
    });
  }
  items.sort(compareItems);
  return items;
}

function printStalenessLines(info: StalenessInfo): void {
  if (info.status === 'NOTAPPLICABLE') return;
  console.log(`Staleness: ${info.status}`);
  if (info.touchedPaths.length > 0)
    console.log(`Touched scope paths: ${info.touchedPaths.join(', ')}`);
  if (info.specUpdated) console.log('Spec file updated since base.');
  if (info.dirty) console.log('Working tree is dirty; results may be unreliable.');
  for (const note of info.notes) console.log(`Note: ${note}`);
}

type OutMode = 'toon' | 'json' | 'compact-json' | 'human';

/**
 * toon-default-output: explicit `--output` wins, then the v1-parity legacy
 * flags, then the toon default. Legacy `--compact-json` keeps its v1 guard
 * (must pair with `--json`) — standalone compact goes through `--output`.
 */
function resolveOutMode(
  output: string | undefined,
  legacyJson: boolean | undefined,
  legacyCompact: boolean | undefined,
): OutMode | null {
  const modes: readonly string[] = ['toon', 'json', 'compact-json', 'human'];
  if (output !== undefined) {
    if (!modes.includes(output)) {
      console.error(`invalid --output: ${output} (toon | json | compact-json | human)`);
      process.exitCode = 1;
      return null;
    }
    return output as OutMode;
  }
  if (legacyCompact) return 'compact-json';
  if (legacyJson) return 'json';
  return 'toon';
}

/** `--method squash|ff` guard shared by `change archive` / `change finalize`. */
function assertMergeMethod(method: string | undefined): boolean {
  if (method === undefined || method === 'squash' || method === 'ff') return true;
  console.error(`invalid --method: ${method}`);
  process.exitCode = 1;
  return false;
}

/**
 * Legacy `--compact-json` guard (see resolveOutMode): standalone compact is
 * rejected unless paired with `--json` or an explicit `--output`.
 */
function assertCompactJsonPairing(options: {
  compactJson?: boolean;
  json?: boolean;
  output?: string;
}): boolean {
  if (options.compactJson === true && options.json !== true && options.output === undefined) {
    console.error('--compact-json requires --json');
    process.exitCode = 1;
    return false;
  }
  return true;
}

function renderValidateText(items: VItem[]): void {
  const passed = items.filter((i) => i.valid).length;
  const failed = items.length - passed;
  for (const item of items) {
    if (item.valid) {
      console.log(`OK ${item.type}/${item.id}`);
    } else {
      console.error(`FAIL ${item.type}/${item.id}`);
      for (const issue of item.issues) {
        console.error(`  [${issue.level}] ${issue.path}: ${issue.message}`);
      }
    }
    if (item.type === 'spec') printStalenessLines(item.staleness);
  }
  console.log(`Totals: ${passed} passed, ${failed} failed (${items.length} items)`);
}

function renderValidateReport(items: VItem[], mode: 'json' | 'compact-json' | 'toon'): void {
  const types = [...new Set(items.map((i) => i.type))] as string[];
  const summary = {
    totals: {
      items: items.length,
      passed: items.filter((i) => i.valid).length,
      failed: items.filter((i) => !i.valid).length,
    },
    byType: types.reduce<Record<string, { items: number; passed: number; failed: number }>>(
      (acc, t) => {
        const of = items.filter((i) => i.type === t);
        acc[t] = {
          items: of.length,
          passed: of.filter((i) => i.valid).length,
          failed: of.filter((i) => !i.valid).length,
        };
        return acc;
      },
      {},
    ),
  };
  console.log(renderMachine({ items, summary, version: '1.0' }, mode));
}

const SPEC_NEXT_STEPS = [
  '- Ensure spec ISON includes `purpose` and `requirements`',
  '- Each requirement MUST include at least one scenario object',
  '- Re-run with --json to see structured report',
];
const CHANGE_NEXT_STEPS = [
  '- Edit live single-track specs (`llmanspec/specs/<capability>.feature`) on the feature branch (@human constraints and @executable acceptance share one track, linked via @req); run `llman-sdd change start <id>` or `change attach <id>`',
  '- Ensure proposal.md, design.md (if needed), and tasks.md are complete before apply',
  '- Debug change state: llman-sdd show <id> --json --type change',
];

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
  .option('--include-info', 'keep INFO-level issues (default: WARNING and above)')
  .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
  .option(
    '--no-check',
    'v1 parity no-op: accepted but validate never executes anything; BDD scenarios run via the project test suite (bdd.run_command)',
  )
  .option(
    '--check',
    'v1 parity no-op alias: validate never executes bdd.run_command; BDD execution lives in the project test suite',
  )
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
        includeInfo?: boolean;
        output?: string;
        noCheck?: boolean;
        check?: boolean;
      },
    ) => {
      if (!assertCompactJsonPairing(options)) return;
      const outMode = resolveOutMode(options.output, options.json, options.compactJson);
      if (outMode === null) return;
      // r32: INFO issues are presentation noise — dropped unless opted in.
      // Filtering never touches `valid`, summaries, or exit codes.
      const keepInfo = options.includeInfo === true;
      const stripInfo = <T extends { issues: { level: string }[] }>(it: T): T =>
        keepInfo ? it : { ...it, issues: it.issues.filter((x) => x.level !== 'INFO') };
      warnDirtySpecsOnDefaultBranch();
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

      // ---- single item (auto-disambiguate: spec first, then change) ----
      if (item !== undefined) {
        const entries = discoverSpecs('llmanspec/specs', newIo());
        const specEntry =
          options.type === 'change'
            ? undefined
            : entries.find(
                (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
              );
        if (specEntry !== undefined) {
          const items = specV1Items({ strict: options.strict });
          const mine = items.find((i) => i.id === item);
          if (mine === undefined) {
            console.error(`no spec or change matches: ${item}`);
            process.exitCode = 1;
            return;
          }
          const shown = stripInfo(mine);
          if (outMode !== 'human') {
            renderValidateReport([shown], outMode);
            process.exitCode = shown.valid ? 0 : 1;
            return;
          }
          if (shown.valid) {
            console.log(`Specification '${item}' is valid`);
          } else {
            console.error(`Specification '${item}' has issues`);
            for (const issue of shown.issues)
              console.error(`  [${issue.level}] ${issue.path}: ${issue.message}`);
            console.error('Next steps:');
            for (const s of SPEC_NEXT_STEPS) console.error(s);
          }
          if (shown.type === 'spec') printStalenessLines(shown.staleness);
          if (!shown.valid) console.error('Error: validation failed');
          process.exitCode = shown.valid ? 0 : 1;
          return;
        }
        // change single (r61: v1 r112 prefix resolution on the change id)
        const io = newIo();
        const root = process.cwd();
        const resolved = resolveChangeIdOrExit(item, { suppressHint: options.json === true });
        if (resolved === null) return;
        const changeId = resolved.id;
        const res = validateChange(
          io,
          root,
          changeId,
          {
            strict_defer: loadCliConfig()?.archive?.strict_defer ?? null,
            min_completion_ratio: loadCliConfig()?.archive?.min_completion_ratio ?? null,
            change_id_pattern: loadCliConfig()?.change_id?.pattern ?? null,
          },
          {
            stage: options.stage as never,
            strict: options.strict === true,
            git: makeCliGit(process.cwd()),
          },
        );
        const infos = res.issues.filter((i) => i.level === 'INFO');
        if (outMode !== 'human') {
          renderValidateReport(
            [
              stripInfo({
                id: changeId,
                type: 'change',
                valid: res.valid,
                issues: res.issues,
                durationMs: 0,
                staleness: notApplicableStaleness(),
                matchedViaPrefix: resolved.viaPrefix,
              }),
            ],
            outMode,
          );
          process.exitCode = res.valid ? 0 : 1;
          return;
        }
        if (res.valid) {
          console.log(`Change '${changeId}' is valid`);
        } else {
          console.error(`Change '${changeId}' has issues`);
          for (const issue of res.issues.filter((i) => i.level !== 'INFO'))
            console.error(`  [${issue.level}] ${issue.path}: ${issue.message}`);
          console.error('Next steps:');
          for (const s of CHANGE_NEXT_STEPS) console.error(s);
        }
        if (keepInfo) {
          for (const info of infos) console.error(`[${info.level}] ${info.path}: ${info.message}`);
        }
        if (!res.valid) console.error('Error: validation failed');
        process.exitCode = res.valid ? 0 : 1;
        return;
      }

      // ---- bulk ----
      const specScope = options.all || !options.changes || options.specs === true;
      const changeScope = options.all || options.changes === true;
      const defaultSpecsOnly = !options.all && !options.changes;
      const effectiveSpecs = defaultSpecsOnly ? true : specScope;
      const effectiveChanges = defaultSpecsOnly ? false : changeScope;

      let items: VItem[] = [];
      if (effectiveSpecs) items = items.concat(specV1Items({ strict: options.strict }));
      if (effectiveChanges) {
        const names = collectChanges(newIo(), process.cwd(), new Date(), {
          maxScanDepth: cliMaxScanDepth(),
        }).map((c) => c.name);
        items = items.concat(
          changeV1Items(names, { stage: options.stage, strict: options.strict }),
        );
      }
      items.sort(compareItems);
      if (!keepInfo) items = items.map(stripInfo);

      if (outMode !== 'human') {
        renderValidateReport(items, outMode);
        if (items.some((i) => !i.valid)) console.error('Error: validation failed');
        process.exitCode = items.some((i) => !i.valid) ? 1 : 0;
        return;
      }
      renderValidateText(items);
      if (items.some((i) => !i.valid)) console.error('Error: validation failed');
      process.exitCode = items.some((i) => !i.valid) ? 1 : 0;
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
  .option('--verb <verb>', 'explicit verb for change_id.template rendering')
  .option('--force', 'overwrite an existing proposal.md')
  .option('--dry-run', 'print the resulting id without creating anything')
  .action(
    (
      id: string | undefined,
      options: { from?: string; verb?: string; force?: boolean; dryRun?: boolean },
    ) => {
      if ((id === undefined) === (options.from === undefined)) {
        console.error('<CHANGE> and --from are mutually exclusive; pass one or the other');
        process.exitCode = 1;
        return;
      }
      if (options.dryRun) {
        console.log(id ?? deriveChangeId(options.from as string));
        return;
      }
      const cliConfig = loadCliConfig();
      const template = cliConfig?.change_id?.template;
      if (options.from !== undefined && template) {
        const slug = deriveChangeId(options.from);
        const { verb, subject } = splitVerb(slug, (options as { verb?: string }).verb);
        const derived = renderChangeIdTemplate(template, {
          llman_sdd_unique_id: nextUniqueNumber(
            {
              listDir: (p) => readdirSync(resolve(p)),
              isDirectory: (p) => statSync(resolve(p)).isDirectory(),
            },
            'llmanspec',
          ),
          verb,
          subject,
          date: new Date().toISOString().slice(0, 10),
        });
        console.log(`derived change id: ${derived}`);
        const io = newIo();
        const result = newChange(io, { id: derived, force: options.force });
        console.log(`./${result.path}`);
        return;
      }
      const io = newIo();
      const result = newChange(io, { id, from: options.from, force: options.force });
      if (options.from !== undefined) console.log(`derived change id: ${result.id}`);
      console.log(`./${result.path}`);
    },
  );

change
  .command('start')
  .description('Bind the change to a new feature branch (clean tree + default branch gates)')
  .argument('<id>')
  .option(
    '--branch-prefix <prefix>',
    'feature branch prefix (default: sdd.branch_prefix config, then sdd/)',
  )
  .action((id: string, options: { branchPrefix?: string }) => {
    const resolved = resolveChangeIdOrExit(id);
    if (resolved === null) return;
    const git = makeCliGit(process.cwd());
    const config = loadCliConfig();
    const result = startChange(git, newIo(), resolved.id, {
      branchPrefix: options.branchPrefix ?? config?.sdd?.branch_prefix ?? 'sdd/',
    });
    console.log(
      `started change \`${resolved.id}\` → branch \`${result.branch}\` base \`${result.baseSha}\` base-branch \`${result.baseBranch}\``,
    );
  });

change
  .command('attach')
  .description('Bind the change to the current feature branch')
  .argument('<id>')
  .option('--force', 'rebind an already attached change to the current branch')
  .option('--base <branch>', 'explicit fork-point branch to record')
  .action((id: string, options: { force?: boolean; base?: string }) => {
    const resolved = resolveChangeIdOrExit(id);
    if (resolved === null) return;
    const result = attachChange(makeCliGit(process.cwd()), newIo(), resolved.id, {
      force: options.force,
      base: options.base,
    });
    console.log(
      `attached change \`${resolved.id}\` → branch \`${result.branch}\` base \`${result.baseSha}\` base-branch \`${result.baseBranch}\``,
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
  .option('--skip-specs', 'legacy flag accepted for v1 parity (no longer merges deltas)')
  .addOption(new Option('--force', 'skip task and git gates').hideHelp())
  .action(
    (
      id: string,
      options: { into?: string; method?: string; dryRun?: boolean; force?: boolean },
    ) => {
      if (!assertMergeMethod(options.method)) return;
      const resolved = resolveChangeIdOrExit(id);
      if (resolved === null) return;
      id = resolved.id;
      const io = newIo();
      if (options.dryRun) {
        const date = new Date().toISOString().slice(0, 10);
        console.log(
          `Would move llmanspec/changes/${id} -> llmanspec/changes/archive/${date}-${id}`,
        );
        return;
      }
      const config = loadCliConfigUnchecked();
      // v1 task gate: blocked output + options list before the error.
      if (!options.force) {
        const tasksPath = `llmanspec/changes/${id}/tasks.md`;
        if (existsSync(tasksPath)) {
          const pending: string[] = [];
          for (const line of readFileSync(tasksPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*-\s+\[ \]\s*(.*)$/u);
            if (m && m[1] !== undefined) pending.push(m[1].trim());
          }
          if (pending.length > 0) {
            console.error(`Archive blocked: ${pending.length} unchecked task(s).`);
            for (const item of pending) console.error(`  - [ ] ${item}`);
            console.error(
              'Options:\n  1. Complete the remaining tasks\n  2. Use --force to archive anyway (not recommended)',
            );
            throw new Error('archive blocked by unchecked tasks');
          }
        }
      }
      const result = archiveChange(makeCliGit(process.cwd()), io, id, {
        into: options.into,
        method: options.method as 'squash' | 'ff' | undefined,
        force: options.force,
        minCompletionRatio: config?.archive?.min_completion_ratio ?? undefined,
      });
      const archiveName = (result.archiveDir ?? '').slice(
        (result.archiveDir ?? '').lastIndexOf('/') + 1,
      );
      console.log(`Change '${id}' archived as '${archiveName}'.`);
    },
  );

change
  .command('diff')
  .description('Print the bound branch diff vs base')
  .argument('<id>')
  .option('--json', 'emit {change, branch, base, commitCount}')
  .option('--export-patch <path>', 'write the diff to a file instead of stdout')
  .action((id: string, options: { json?: boolean; exportPatch?: string }) => {
    const resolved = resolveChangeIdOrExit(id);
    if (resolved === null) return;
    id = resolved.id;
    const git = makeCliGit(process.cwd());
    if (options.json) {
      const info = changeDiffInfo(git, newIo(), id);
      console.log(JSON.stringify(info, null, 2));
      return;
    }
    const diff = changeDiff(git, newIo(), id);
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
      if (!assertMergeMethod(options.method)) return;
      if (options.check !== false) {
        const failed = runValidateSweep();
        if (failed) {
          console.error('finalize aborted: validation sweep failed (use --no-check to skip)');
          process.exitCode = 1;
          return;
        }
      }
      const resolved = resolveChangeIdOrExit(id);
      if (resolved === null) return;
      id = resolved.id;
      const config = loadCliConfig();
      const method = options.method ?? config?.sdd?.merge_method ?? 'squash';
      const result = finalizeChange(makeCliGit(process.cwd()), newIo(), id, {
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
  .option('--changes', 'list changes (v1 explicit scope flag; default)')
  .option('--specs', 'list specs instead of changes')
  .option('--json', 'machine-readable output')
  .option('--compact-json', 'single-line --json (requires --json)')
  .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
  .option('--sort <order>', 'recent (mtime desc, default) | name')
  .action(
    (options: {
      specs?: boolean;
      json?: boolean;
      compactJson?: boolean;
      output?: string;
      sort?: string;
    }) => {
      if (!assertCompactJsonPairing(options)) return;
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
        const specsMode = resolveOutMode(options.output, options.json, options.compactJson);
        if (specsMode === null) return;
        emit(
          specsMode !== 'human'
            ? renderSpecsJson(summaries, specsMode)
            : renderSpecsList(summaries).join('\n'),
        );
        return;
      }
      let changes = collectChanges(newIo(), process.cwd(), new Date(), {
        maxScanDepth: cliMaxScanDepth(),
      });
      if (options.sort === 'name') {
        changes = [...changes].toSorted((a, b) => a.name.localeCompare(b.name));
      }
      emit(
        (() => {
          const changesMode = resolveOutMode(options.output, options.json, options.compactJson);
          if (changesMode === null) return '';
          return changesMode !== 'human'
            ? renderChangesJson(changes, changesMode)
            : renderChangesList(changes, new Date()).join('\n');
        })(),
      );
    },
  );

program
  .command('show')
  .description('Show a change or spec')
  .argument('<item>')
  .option('--output <format>', 'json | compact | meta-only | no-scenarios | deltas | reqs-only')
  .option('--type <type>', 'force disambiguation: change | spec')
  .option('-r, --requirement <n>', 'spec only: show a specific requirement by 1-based index')
  .action((item: string, options: { output?: string; type?: string; requirement?: string }) => {
    const outTokens = new Set(
      (options.output ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t !== ''),
    );
    const asCompact = outTokens.has('compact');
    const metaOnly = outTokens.has('meta-only');
    const noScenarios = outTokens.has('no-scenarios');
    const reqsOnly = outTokens.has('reqs-only');
    // toon-default-output: no --output → toon; machine modes share the json
    // gates (Why/What validation) and suppress the prefix hint; `human` is the
    // sole v1 text form. Legacy modifiers (meta-only/no-scenarios/reqs-only/
    // deltas/-r) belong to the text face — they route to human (v1 no-op
    // render semantics preserved).
    const wantsMachine = outTokens.has('json') || outTokens.has('toon') || asCompact;
    // no --output at all → toon; explicit legacy-only modifiers → human text
    const isHuman = options.output !== undefined && (outTokens.has('human') || !wantsMachine);
    const asJson = !isHuman;
    const showMode: 'json' | 'compact-json' | 'toon' = asCompact
      ? 'compact-json'
      : outTokens.has('json')
        ? 'json'
        : 'toon';
    // v1: unknown output tokens are rejected by clap; script consumers rely on
    // the deprecation being a no-op render rather than an error.
    // Spec 判定与 collectSpecs/discoverSpecs 同口径:扁平文件与目录式
    // `specs/<cap>/<cap>.feature` 均按 entry 精确 id(capability ?? fileName)
    // 命中;r25 spec id 精确匹配优先于 change 前缀,不做模糊解析。
    const specEntry = loadSpecEntries().find(
      (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
    );
    const isSpec =
      options.type === 'spec' ||
      existsSync(join('llmanspec', 'specs', `${item}.feature`)) ||
      specEntry !== undefined;

    if (isSpec) {
      const flatSpecPath = join('llmanspec', 'specs', `${item}.feature`);
      // discoverSpecs 的 fileName 已是含 specs 目录前缀的相对路径
      // (如 `llmanspec/specs/<cap>/<cap>.feature`),直接使用。
      const specPath =
        specEntry !== undefined && !existsSync(flatSpecPath) ? specEntry.fileName : flatSpecPath;
      if (!existsSync(specPath)) {
        console.error(`spec not found: ${item}`);
        process.exitCode = 1;
        return;
      }
      if (asJson) {
        console.log(
          renderMachine(
            renderSpecJson(item, {
              metaOnly,
              noScenarios: noScenarios || reqsOnly,
            }),
            showMode,
          ),
        );
        return;
      }
      // text mode: v1 ignores all output modifiers (meta-only/no-scenarios/-r)
      // and renders the full source + morphology.
      const raw = readFileSync(specPath, 'utf8').trimEnd();
      const summary = collectSpecs(loadSpecEntries()).find((x) => x.id === item);
      const morphology = summary
        ? `\n\n## Morphology\nruleCount=${summary.morphology.ruleCount} enforced=${summary.morphology.ruleEnforcedCount} pending=${summary.morphology.rulePendingCount} acceptanceCount=${summary.morphology.acceptanceCount}`
        : '';
      console.log(`## Spec\n${raw}${morphology}`);
      return;
    }

    // ---- change ----
    // r61: v1 r112 prefix chain — exact > unique prefix > multiple > not found.
    const resolved = resolveChangeIdOrExit(item, { suppressHint: asJson });
    if (resolved === null) return;
    const changeId = resolved.id;
    const viaPrefix = resolved.viaPrefix;
    const proposal = readFileSync(join('llmanspec', 'changes', changeId, 'proposal.md'), 'utf8');
    if (asJson) {
      // v1 parse_change gates: Why first, then What Changes (json only).
      if (!hasSection(proposal, 'Why')) {
        process.exitCode = 1;
        throw new Error('Change must have a Why section');
      }
      if (!hasSection(proposal, 'What Changes')) {
        process.exitCode = 1;
        throw new Error('Change must have a What Changes section');
      }
      const result = showChangeJson(
        {
          io: newIo(),
          git: makeCliGit(process.cwd()),
          root: process.cwd(),
          specsDir: 'llmanspec/specs',
        },
        changeId,
        { matchedViaPrefix: viaPrefix },
      );
      console.log(renderMachine(result, showMode));
      return;
    }
    // text: Stage / path / content / Gates trailer (no section gates).
    const changes = collectChanges(newIo(), process.cwd(), new Date(), {
      maxScanDepth: cliMaxScanDepth(),
    });
    const change = changes.find((c) => c.name === changeId);
    console.log(`Stage: ${change?.stage ?? 'draft'}`);
    console.log(`path: ${changeId}`);
    process.stdout.write(proposal);
    if (!proposal.endsWith('\n')) console.log();
    const gates = showChangeJson(
      {
        io: newIo(),
        git: makeCliGit(process.cwd()),
        root: process.cwd(),
        specsDir: 'llmanspec/specs',
      },
      changeId,
    ).gateChecks as { name: string; pass: boolean; hint: string }[];
    const passCount = gates.filter((g) => g.pass).length;
    console.log(`Gates: ${passCount}/${gates.length} pass`);
    for (const g of gates.filter((g) => !g.pass)) console.log(`✗ ${g.name}: ${g.hint}`);
  });

function hasSection(proposal: string, heading: string): boolean {
  return (
    new RegExp(`^## ${heading.replace(/[/\\]/u, '')}\\s*$`, 'mu').test(proposal) ||
    proposal.includes(`## ${heading}`)
  );
}

function renderSpecJson(
  item: string,
  opts: { metaOnly: boolean; noScenarios: boolean },
): Record<string, unknown> {
  const entry = loadSpecEntries().find(
    (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
  );
  const doc = entry?.doc as
    | {
        header: { capability: string | null; purpose: string | null };
        scenarios: {
          name: string;
          classification: string;
          reqIds: string[];
          statement: string;
          steps: { kind: string; text: string }[];
        }[];
      }
    | undefined;
  const cap = entry ? (doc?.header.capability ?? item) : item;
  const purpose = doc?.header.purpose ?? '';
  const humans = doc?.scenarios.filter((s) => s.classification === 'human') ?? [];
  const acceptances = doc?.scenarios.filter((s) => s.classification === 'executable') ?? [];
  const morphology = morphologyOfScenarios(doc?.scenarios ?? []);
  if (opts.metaOnly) {
    return {
      id: item,
      featureId: cap,
      title: cap,
      purpose,
      overview: purpose,
      requirementCount: humans.length,
      morphology,
    };
  }
  const requirements = humans.map((rule) => ({
    reqId: rule.reqIds[0] ?? '',
    title: rule.name,
    text: rule.statement,
    scenarios: opts.noScenarios
      ? []
      : acceptances
          .filter((a) => a.reqIds.some((rid) => rule.reqIds.includes(rid)))
          .map((a) => ({
            id: a.name,
            rawText: `GIVEN: ${a.steps
              .filter((s) => s.kind === 'given')
              .map((s) => s.text)
              .join('\n')}\nWHEN: ${a.steps
              .filter((s) => s.kind === 'when')
              .map((s) => s.text)
              .join('\n')}\nTHEN: ${a.steps
              .filter((s) => s.kind === 'then')
              .map((s) => s.text)
              .join('\n')}`,
            source: 'acceptance',
            reqIds: a.reqIds,
          })),
  }));
  return {
    id: item,
    title: cap,
    purpose,
    overview: purpose,
    requirementCount: humans.length,
    requirements,
    morphology,
  };
}

program
  .command('graph')
  .description('Generate a change dependency graph (mermaid)')
  .argument('[change]', 'seed change id (BFS over depends_on)')
  .option('--format <format>', 'output format', 'mermaid')
  .option('--scope <scope>', 'active | archived | all (comma-combined)', 'active')
  .option('--depth <n>', 'seed BFS depth (default: 1)')
  .action(
    (change: string | undefined, options: { format: string; scope?: string; depth?: string }) => {
      if (options.format !== 'mermaid' && options.format !== 'json' && options.format !== 'toon') {
        process.exitCode = 1;
        throw new Error(`Unsupported format: ${options.format}. Supported: mermaid | json | toon`);
      }
      const depth = options.depth !== undefined ? Number(options.depth) : undefined;
      if (depth !== undefined && (!Number.isInteger(depth) || depth < 0)) {
        console.error(`invalid --depth: ${options.depth}`);
        process.exitCode = 1;
        return;
      }
      const graphOpts = {
        scope: options.scope,
        depth: depth ?? 1,
        seed: change,
      };
      if (options.format === 'mermaid') {
        console.log(graphMermaid(newIo(), process.cwd(), graphOpts).join('\n'));
      } else {
        console.log(renderMachine(graphData(newIo(), process.cwd(), graphOpts), options.format));
      }
    },
  );

const spec = program.command('spec').description('Spec authoring helpers');

spec
  .command('skeleton')
  .description('Generate a single-track spec skeleton for a capability')
  .argument('<capability>')
  .option('--force', 'overwrite an existing spec file')
  .action((capability: string, options: { force?: boolean }) => {
    const locale = loadCliConfigUnchecked()?.locale ?? 'en';
    const path = join('llmanspec', 'specs', `${capability}.feature`);
    if (!options.force && existsSync(path)) {
      console.error(`spec already exists: ${path} (use --force to overwrite)`);
      process.exitCode = 1;
      return;
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

const project = program.command('project').description('Project management commands');

project
  .command('dedupe-req-ids')
  .description('Remap globally duplicated req ids (report with --dry-run)')
  .option('--dry-run', 'report the remap plan without writing')
  .action((options: { dryRun?: boolean }) => {
    // v1 parity: dedupe registry covers @human (rule) req ids only.
    const entries = loadSpecEntries();
    const owners = new Map<string, string[]>();
    for (const e of entries) {
      for (const sc of e.doc.scenarios) {
        if (sc.classification !== 'human') continue;
        for (const rid of sc.reqIds) {
          const list = owners.get(rid) ?? [];
          if (!list.includes(e.fileName)) list.push(e.fileName);
          owners.set(rid, list);
        }
      }
    }
    const duplicates = [...owners.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([reqId, files]) => ({ reqId, files }));
    if (duplicates.length === 0) {
      console.log('No colliding req_id values in llmanspec/specs.');
      return;
    }
    const io = newIo();
    const plan = planDedupe(entries, io, 'llmanspec/specs', duplicates);
    // v1 output: `{cap}: {from} → {to}` per remap (prefix in dry-run) + count line.
    for (const item of plan) {
      const cap = item.remapFile.replace(/^.*specs\//u, '').replace(/\.feature$/u, '');
      const prefix = options.dryRun ? '[dry-run] ' : '';
      console.log(`${prefix}${cap}: ${item.reqId} → ${item.newReqId}`);
    }
    console.log(`${plan.length} remapping(s)${options.dryRun ? ' (dry-run)' : ''}`);
  });

project
  .command('migrate')
  .description('Legacy migration collaboration notes (prints guidance; performs no migration)')
  .option('--kind <kind>', 'collaboration notes: toon2features | specs-flatten')
  .action((options: { kind?: string }) => {
    const locale = loadCliConfig()?.locale ?? 'en';
    if (options.kind === undefined) {
      console.log(migrateOverviewFor(locale));
      return;
    }
    const note = migrateNoteFor(options.kind, locale);
    if (note === null) {
      console.error(
        `unknown migration kind: ${options.kind} (expected: toon2features | specs-flatten)`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(note);
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
  .option('--dest <path>', 'restore into this directory (created when missing)')
  .action(async (options: { change: string[]; dest?: string }) => {
    if (options.dest !== undefined) {
      mkdirSync(resolve(options.dest), { recursive: true });
    }
    const sz = await makeWasmSevenZip();
    const root = process.cwd();
    const io = makeIo(root);
    try {
      const result = await runThaw(io, sz, root, options.change, { dest: options.dest });
      for (const line of result.lines) console.log(line);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exitCode = 1;
    }
  });

const review = program
  .command('review')
  .description('Aggregate review: pending/unbound/stale signals plus a validate sweep');

review
  .option('--capability <capability>', 'restrict the sweep to one capability/spec id')
  .option('--json', 'emit structured JSON (signals + summary)')
  .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
  .option('--export-html <path>', 'write a self-contained HTML report')
  .action(
    (options: { capability?: string; json?: boolean; output?: string; exportHtml?: string }) => {
      const config = loadCliConfigUnchecked();
      const bindings = config?.bdd?.bindings?.filter((b) => b.kind === 'tags') ?? [];
      const io = newIo();
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
          git: makeCliGit(process.cwd()),
          root: process.cwd(),
          specsDir: 'llmanspec/specs',
        },
        io,
      );
      if (options.exportHtml !== undefined) {
        const template = templateIo.readText(join(TEMPLATES_ROOT, 'shared', 'review.html'));
        writeFileSync(options.exportHtml, renderReviewHtml(template, result));
        console.log(`wrote ${options.exportHtml}`);
      }
      const outMode = resolveOutMode(options.output, options.json, false);
      if (outMode === null) return;
      if (outMode !== 'human') {
        console.log(renderMachine({ signals: result.signals, summary: result.summary }, outMode));
      } else {
        console.log(result.lines.join('\n'));
      }
      if (result.exitCode !== 0) process.exitCode = result.exitCode;
    },
  );

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
  .option('--no-interactive', 'print state instead of launching the interactive picker')
  .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
  .action((options: { json?: boolean; output?: string; interactive?: boolean }) => {
    const path = 'llmanspec/config.yaml';
    const info = skillsJson(readFileSync(path, 'utf8'));
    const mode = resolveOutMode(options.output, options.json, false);
    if (mode === null) return;
    if (mode !== 'human') {
      console.log(renderMachine(info, mode));
      return;
    }
    const enabled = info.enabled;
    const available = info.available;
    console.log('Enabled optional skills:');
    if (enabled.length === 0) console.log('  (none)');
    else for (const s of enabled) console.log(`  [x] ${s}`);
    console.log();
    console.log('Available but not enabled:');
    for (const s of available) {
      if (!enabled.includes(s)) console.log(`  [ ] ${s} — ${skillDesc(s)}`);
    }
    console.log();
    console.log('(Run without --no-interactive to edit interactively.)');
  });

function resolveBackend(flag: string | undefined): 'pageindex' {
  const chosen = flag ?? process.env.LLMAN_SDD_INDEX_BACKEND ?? 'pageindex';
  if (chosen === 'rag') {
    throw new Error(
      'Backend `rag` is no longer supported. Use the default pageindex backend instead:\nSet `LLMAN_SDD_INDEX_CHAT_MODEL` to a tool-calling chat model, then\nrun `llman-sdd index rebuild`.',
    );
  }
  if (chosen !== 'pageindex') {
    throw new Error(`Unsupported backend: ${chosen}`);
  }
  return 'pageindex';
}

const indexCmd = program
  .command('index')
  .description('Index management commands (rebuild, check freshness)');

indexCmd
  .command('rebuild')
  .description('Rebuild the pageindex tree from spec IR (no LLM)')
  .option('--backend <name>', 'index backend (pageindex only)')
  .action((options: { backend?: string }) => {
    resolveBackend(options.backend);
    const result = rebuildIndex(newIo(), 'llmanspec/specs', loadSpecEntries(), {
      chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
    });
    for (const line of result.lines.slice(0, -1)) console.error(line);
    if (result.lines.length > 0) console.log(result.lines.at(-1));
  });

indexCmd
  .command('check')
  .description('Check index freshness without rebuilding')
  .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
  .action((options: { output?: string }) => {
    const result = checkIndexFreshness(newIo(), 'llmanspec/specs');
    const mode = resolveOutMode(options.output, undefined, undefined);
    if (mode === null) return;
    if (mode !== 'human') {
      console.log(renderMachine({ fresh: result.fresh, notes: result.lines }, mode));
    } else {
      for (const line of result.lines) console.log(line);
    }
    if (!result.fresh) process.exitCode = 1;
  });

program
  .command('context')
  .description('Get specs relevant to a task (agent-oriented, pageindex agentic retrieval)')
  .option('--task <task>', 'natural language task description')
  .option('--paths <paths>', 'comma-separated file paths')
  .option('--top <n>', 'max entries per tier', '5')
  .option('--backend <name>', 'retrieval backend (pageindex only)')
  .action(async (options: { task?: string; paths?: string; top?: string; backend?: string }) => {
    resolveBackend(options.backend);
    if (!options.task && !options.paths) {
      console.error('at least one of --task or --paths is required');
      process.exitCode = 1;
      return;
    }
    const config = resolveChatConfig(process.env as Record<string, string | undefined>);
    // r62: lazy refresh runs BEFORE the chat-model gate (v1 r97 — the index
    // self-heals even when retrieval subsequently fails with api_error).
    const refresh = loadTreeWithAutoRebuild(newIo(), 'llmanspec/specs', loadSpecEntries(), {
      chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
    });
    if (refresh.tree === null || refresh.error !== null) {
      const failed = unavailableResult();
      failed.status.errorKind = 'index_rebuild_failed';
      failed.status.qualityNote =
        refresh.error ?? 'index rebuild failed — run `llman-sdd index rebuild`';
      console.log(JSON.stringify(failed, null, 2));
      return;
    }
    const tree = refresh.tree;
    if (config === null) {
      // v1 parity: unavailable/error JSON on stdout, exit 0.
      console.log(JSON.stringify(unavailableResult(), null, 2));
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

function commandChain(argv: string[]): string {
  let node: Command = program;
  let chain = '';
  let rest = argv.slice(2);
  while (rest.length > 0) {
    let child: Command | undefined;
    for (const cmd of node.commands) {
      if (cmd.name() === rest[0]) {
        child = cmd;
        break;
      }
    }
    if (child === undefined) break;
    chain += ` ${child.name()}`;
    node = child;
    rest = rest.slice(1);
  }
  return chain;
}

async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    const comErr = error as { code?: string; exitCode?: number; message?: string };
    if (
      comErr?.code === 'commander.version' ||
      comErr?.code === 'commander.help' ||
      comErr?.code === 'commander.helpDisplayed' ||
      comErr?.exitCode === 0
    ) {
      // version/help already rendered to stdout; exit code stays 0.
      return;
    }
    if (comErr?.code === 'commander.unknownOption') {
      const raw = String(comErr.message ?? '');
      const arg = raw.replace(/^error: unknown option ['"]/u, '').replace(/['"]?\s*$/u, '') ?? '';
      const chain = commandChain(process.argv);
      console.error(`error: unexpected argument '${arg}' found`);
      console.error('');
      console.error(`Usage: llman-sdd${chain} [OPTIONS]`);
      console.error('');
      console.error("For more information, try '--help'.");
      process.exitCode = 2;
      return;
    }

    // v1 parity: expected domain errors surface as a single `Error: <message>`
    // line on stderr with exit code 1 (no Bun stack trace).
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.startsWith('Error: ') ? message : `Error: ${message}`);
    process.exitCode = 1;
  }
}

await main();
