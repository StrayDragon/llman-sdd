import { relative } from 'node:path';

import {
  applyStrict,
  buildDuplicatesFor,
  checkGlobalChangeIdUniqueness,
  collectChanges,
  currentBranch,
  defaultBranch,
  discoverRoots,
  evaluateStaleness,
  formatTotals,
  notApplicableStaleness,
  renderMachine,
  resolveInstanceRoot,
  runHarnessForSpecs,
  scopeCrossings,
  specRelFor,
  specIdOf,
  STAGE_ORDER,
  validateCapability,
  validateChange,
  type ChangeIssue,
  type HarnessGate,
  type RootEntry,
  type StalenessInfo,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  assertCompactJsonPairing,
  CliError,
  cliMaxScanDepth,
  exitWith,
  loadCliConfig,
  loadSpecEntries,
  newIo,
  resolveChangeIdOrExit,
  resolveOutMode,
} from '../cli-shared.ts';
import { makeCliHarnessRunner } from '../harness.ts';
import { makeCliGit } from '../io.ts';

interface VItem {
  id: string;
  type: string;
  valid: boolean;
  issues: ChangeIssue[];
  durationMs: number;
  staleness: StalenessInfo;
  matchedViaPrefix: boolean;
}

/** predecessor validate ordering: id asc, tie-broken by type asc. */
function compareItems(a: VItem, b: VItem): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : a.type.localeCompare(b.type);
}

/**
 * Multi-root context of the specs being validated (r91-r92): `repoRelPrefix`
 * lifts instance-root-relative scopes into repo-relative paths for the
 * staleness diff match ('' when the instance root is the git toplevel —
 * byte-identical legacy behavior); `otherRoots` feeds the single-ownership
 * crossings that surface as ERROR issues.
 */
export interface InstanceContext {
  repoRelPrefix: string;
  otherRoots: RootEntry[];
}

function specV1Items(
  opts: {
    strict?: boolean;
    harness?: HarnessGate;
    harnessOnlyIds?: string[];
    instance?: InstanceContext;
  },
  entries: ReturnType<typeof loadSpecEntries> = loadSpecEntries(),
): VItem[] {
  const io = newIo();
  const git = makeCliGit(process.cwd());
  const duplicatesFor = buildDuplicatesFor(entries);
  const liftScope = (scope: string): string =>
    opts.instance !== undefined && opts.instance.repoRelPrefix !== ''
      ? `${opts.instance.repoRelPrefix}/${scope}`
      : scope;

  const items: VItem[] = [];
  for (const entry of entries) {
    const cap = specIdOf(entry);
    const verdict = validateCapability(entry as never, duplicatesFor, io, {
      strict: opts.strict === true,
    });
    const scopes = entry.doc.header.scope?.split(',').map((s) => s.trim()) ?? [];
    const specRel = specRelFor(entry.fileName);
    const staleness = evaluateStaleness({
      git,
      root: process.cwd(),
      specRel,
      scope: scopes.map(liftScope),
      baseRefEnv: process.env.LLMANSPEC_BASE_REF,
    });
    let issues: ChangeIssue[] = verdict.items.map((i) => ({
      level: i.level,
      path: i.id,
      message: i.message,
    }));
    if (opts.instance !== undefined) {
      for (const crossing of scopeCrossings(scopes, process.cwd(), opts.instance.otherRoots)) {
        issues = [
          ...issues,
          {
            level: 'ERROR',
            path: 'single-ownership',
            message: `scope '${crossing.scope}' crosses sub-root '${crossing.rootDir}' — migrate these specs into that root or narrow the scope (one path, one root)`,
          },
        ];
      }
    }
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
  // r13/r48: harness issues attach to their spec item after the structural
  // verdict (execution runs only for the entries actually being validated —
  // a single-item validate scopes the harness to that one spec).
  if (opts.harness !== undefined) {
    const scoped =
      opts.harnessOnlyIds === undefined
        ? entries
        : entries.filter((entry) => opts.harnessOnlyIds?.includes(specIdOf(entry)));
    const outcome = runHarnessForSpecs(
      scoped.map((entry) => ({ capability: specIdOf(entry), featurePath: entry.fileName })),
      opts.harness,
    );
    for (const item of items) {
      const extra = outcome.issuesByCapability.get(item.id);
      if (extra === undefined || extra.length === 0) continue;
      item.issues = [
        ...item.issues,
        ...extra.map((i) => ({ level: i.level, path: i.id, message: i.message })),
      ];
      item.valid = item.issues.every((i) => i.level !== 'ERROR');
    }
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
  // r87: global change-id uniqueness gate. Duplicate ids attach to their
  // active change item when the active change is being validated; archive↔
  // archive / frozen-only collisions surface as synthetic items (no active
  // counterpart to carry the ERROR).
  const duplicates = checkGlobalChangeIdUniqueness(io, `${process.cwd()}/llmanspec/changes`);
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const dup of duplicates) {
    const issue: ChangeIssue = {
      level: 'ERROR',
      path: 'change-id',
      message: `duplicate change id: ${dup}`,
    };
    const target = byId.get(dup);
    if (target !== undefined) {
      target.issues = [...target.issues, issue];
      target.valid = false;
    } else {
      items.push({
        id: dup,
        type: 'change',
        valid: false,
        issues: [issue],
        durationMs: 0,
        staleness: notApplicableStaleness(),
        matchedViaPrefix: false,
      });
    }
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
  console.log(formatTotals(passed, failed, items.length));
}

function gitToplevelOrCwd(): string {
  const toplevel = makeCliGit(process.cwd()).runOpt(['rev-parse', '--show-toplevel']);
  return toplevel ?? process.cwd();
}

/**
 * Multi-root context of the cwd instance (r91-r92): empty otherRoots + ''
 * prefix when run at a lone root — legacy byte-identical behavior.
 */
function instanceContextFor(maxDepth: number): InstanceContext {
  const toplevel = gitToplevelOrCwd();
  const otherRoots = discoverRoots(toplevel, newIo(), { maxDepth }).filter(
    (r) => r.rootDir !== process.cwd(),
  );
  const repoRelPrefix = toplevel === process.cwd() ? '' : relative(toplevel, process.cwd());
  return { repoRelPrefix, otherRoots };
}

interface RootReport {
  root: string;
  items: VItem[];
  summary: ReturnType<typeof summarizeItems>;
}

function summarizeItems(items: VItem[]) {
  const types = [...new Set(items.map((i) => i.type))] as string[];
  return {
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
}

function renderValidateReport(items: VItem[], mode: 'json' | 'compact-json' | 'toon'): void {
  console.log(renderMachine({ items, summary: summarizeItems(items), version: '1.0' }, mode));
}

const SPEC_NEXT_STEPS = [
  '- Ensure each .feature starts with "# capability:", "# purpose:" and "# scope:" header comments',
  '- Each requirement MUST include at least one scenario object',
  '- Re-run with --json to see structured report',
];
const CHANGE_NEXT_STEPS = [
  '- Edit live single-track specs (`llmanspec/specs/<capability>.feature`) on the feature branch (@human constraints and @executable acceptance share one track, linked via @req); run `llman-sdd change start <id>` or `change attach <id>`',
  '- Ensure proposal.md, design.md (if needed), and tasks.md are complete before apply',
  '- Debug change state: llman-sdd show <id> --json --type change',
];

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

/** r13: stderr banner before the first harness execution — once per process. */
let harnessBannerShown = false;

/**
 * r13/r48 trigger state: the nested guard env and the check flags are read
 * here (CLI boundary) and injected into core as parameters — core harness
 * logic never touches process.env. Commander tri-state (both flags declared):
 * --check → check=true, --no-check → check=false, absent → undefined.
 */
function makeHarnessGate(options: { check?: boolean }): HarnessGate {
  const runCommand = loadCliConfig()?.specs?.check_command ?? null;
  const configured = runCommand !== null && runCommand !== '';
  return {
    nested: process.env.LLMAN_SDD_HARNESS_ACTIVE === '1',
    // Opt-in harness (2026-10 decision): absent → 'off' — structure/state gate
    // only; --check → 'on' (explicit full harness); --no-check → 'off'
    // (explicitly decline harness evidence, same effective as default). The CLI
    // never sends 'default'; core still treats a received 'default' as
    // run-if-configured (its own contract).
    check: options.check === true ? 'on' : 'off',
    runner: configured ? makeCliHarnessRunner() : undefined,
    runCommand,
    cwd: process.cwd(),
    onBeforeFirstRun: (expanded: string): void => {
      if (harnessBannerShown) return;
      harnessBannerShown = true;
      console.error(`running spec check: ${expanded} (explicit --check harness run)`);
    },
  };
}

export function registerValidate(program: Command): void {
  const validate = program
    .command('validate')
    .description('Validate specs and changes (structural gates + stage/completion rules)')
    .argument('[item]', 'spec id or change id (auto-disambiguated)')
    .option('--all', 'validate all specs and all changes')
    .option('--changes', 'restrict scope to changes')
    .option('--specs', 'restrict scope to specs')
    .option('--type <type>', 'force disambiguation: change | spec')
    .option('--stage <stage>', 'change stage gate: draft | designed | planned | full')
    .option('--strict', 'warnings also make the exit code non-zero')
    .option(
      '--directory <path>',
      'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
    )
    .option(
      '--all-roots',
      'aggregate: validate every discovered llmanspec root (specs scope, any root red → non-zero exit)',
    )
    .option('--include-info', 'keep INFO-level issues (default: WARNING and above)')
    .option(
      '--no-check',
      'skip the spec check (same as default; explicitly declines harness evidence)',
    )
    .option('--check', 'run the spec check (full harness) explicitly — opt-in, default skips');
  addReportOutputOptions(validate);
  validate.action(
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
        check?: boolean;
        directory?: string;
        allRoots?: boolean;
      },
    ) => {
      if (!assertCompactJsonPairing(options)) return;
      const outMode = resolveOutMode(options.output, options.json, options.compactJson);
      // r32: INFO issues are presentation noise — dropped unless opted in.
      // Filtering never touches `valid`, summaries, or exit codes.
      const keepInfo = options.includeInfo === true;
      const stripInfo = <T extends { issues: { level: string }[] }>(it: T): T =>
        keepInfo ? it : { ...it, issues: it.issues.filter((x) => x.level !== 'INFO') };
      warnDirtySpecsOnDefaultBranch();
      if (options.type !== undefined && options.type !== 'change' && options.type !== 'spec') {
        throw new CliError(`invalid --type: ${options.type}`);
      }
      if (
        options.stage !== undefined &&
        !(STAGE_ORDER as readonly string[]).includes(options.stage)
      ) {
        throw new CliError(`invalid --stage: ${options.stage}`);
      }
      const maxDepth = cliMaxScanDepth(program);

      // ---- aggregate over every discovered root (r91) ----
      if (options.allRoots === true) {
        if (item !== undefined) {
          throw new CliError('--all-roots validates every root; drop the <item> argument');
        }
        const start = options.directory ?? gitToplevelOrCwd();
        const roots = discoverRoots(start, newIo(), { maxDepth });
        if (roots.length === 0) {
          throw new CliError(`no llmanspec roots discovered under: ${start}`);
        }
        const originalCwd = process.cwd();
        const reports: RootReport[] = [];
        let anyFail = false;
        try {
          for (const root of roots) {
            process.chdir(root.rootDir);
            const items = specV1Items({
              strict: options.strict,
              harness: makeHarnessGate(options),
              instance: instanceContextFor(maxDepth),
            });
            const visible = keepInfo ? items : items.map(stripInfo);
            if (visible.some((i) => !i.valid)) anyFail = true;
            reports.push({
              root: relative(start, root.rootDir) || '.',
              items: visible,
              summary: summarizeItems(visible),
            });
          }
        } finally {
          process.chdir(originalCwd);
        }
        if (outMode === 'human') {
          for (const report of reports) {
            console.log(`root ${report.root}`);
            renderValidateText(report.items);
          }
        } else {
          const totals = reports.reduce(
            (acc, r) => ({
              items: acc.items + r.summary.totals.items,
              passed: acc.passed + r.summary.totals.passed,
              failed: acc.failed + r.summary.totals.failed,
            }),
            { items: 0, passed: 0, failed: 0 },
          );
          console.log(
            renderMachine({ roots: reports, summary: { totals }, version: '1.0' }, outMode),
          );
        }
        if (anyFail) console.error('Error: validation failed');
        exitWith(anyFail ? 1 : 0);
        return;
      }

      // ---- instance root resolution: --directory start, else nearest
      // ancestor llmanspec/ ("cd into the subpackage and run", r94). A no-op
      // when cwd already sits at a root (byte-identical legacy path). ----
      if (options.directory !== undefined) {
        const root = resolveInstanceRoot(options.directory, newIo());
        if (root === null) {
          throw new CliError(`no llmanspec root at or above: ${options.directory}`);
        }
        process.chdir(root);
      } else {
        const root = resolveInstanceRoot(process.cwd(), newIo());
        if (root !== null && root !== process.cwd()) process.chdir(root);
      }

      const harness = makeHarnessGate(options);

      // ---- single item (auto-disambiguate: spec first, then change) ----
      if (item !== undefined) {
        const entries = loadSpecEntries();
        const specEntry =
          options.type === 'change' ? undefined : entries.find((e) => specIdOf(e) === item);
        if (specEntry !== undefined) {
          const items = specV1Items(
            {
              strict: options.strict,
              harness,
              harnessOnlyIds: [item],
              instance: instanceContextFor(maxDepth),
            },
            entries,
          );
          const mine = items.find((i) => i.id === item);
          if (mine === undefined) {
            throw new CliError(`no spec or change matches: ${item}`);
          }
          const shown = stripInfo(mine);
          if (outMode !== 'human') {
            renderValidateReport([shown], outMode);
            exitWith(shown.valid ? 0 : 1);
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
          exitWith(shown.valid ? 0 : 1);
          return;
        }
        // change single (r61: predecessor r112 prefix resolution on the change id)
        const io = newIo();
        const root = process.cwd();
        const resolved = resolveChangeIdOrExit(program, item, {
          suppressHint: options.json === true,
        });
        const changeId = resolved.id;
        const res = validateChange(
          io,
          root,
          changeId,
          {
            strict_defer: loadCliConfig()?.archive?.strict_defer ?? null,
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
          exitWith(res.valid ? 0 : 1);
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
        exitWith(res.valid ? 0 : 1);
        return;
      }

      // ---- bulk ----
      const specScope = options.all || !options.changes || options.specs === true;
      const changeScope = options.all || options.changes === true;
      const defaultSpecsOnly = !options.all && !options.changes;
      const effectiveSpecs = defaultSpecsOnly ? true : specScope;
      const effectiveChanges = defaultSpecsOnly ? false : changeScope;

      let items: VItem[] = [];
      if (effectiveSpecs) {
        items = items.concat(
          specV1Items({
            strict: options.strict,
            harness,
            instance: instanceContextFor(maxDepth),
          }),
        );
      }
      if (effectiveChanges) {
        const names = collectChanges(newIo(), process.cwd(), new Date(), {
          maxScanDepth: maxDepth,
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
        exitWith(items.some((i) => !i.valid) ? 1 : 0);
        return;
      }
      renderValidateText(items);
      if (items.some((i) => !i.valid)) {
        // r47: human mode carries the Next steps guidance for every failing
        // item kind (bulk path; the single-item path emits per-kind steps).
        const kinds = new Set(items.filter((i) => !i.valid).map((i) => i.type));
        console.error('Next steps:');
        for (const kind of kinds) {
          for (const s of kind === 'spec' ? SPEC_NEXT_STEPS : CHANGE_NEXT_STEPS) console.error(s);
        }
        console.error('Error: validation failed');
      }
      exitWith(items.some((i) => !i.valid) ? 1 : 0);
    },
  );
}
