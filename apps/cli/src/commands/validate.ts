import { relative, resolve } from 'node:path';

import {
  buildDuplicatesFor,
  checkGlobalChangeIdUniqueness,
  collectChangeIdValues,
  collectChanges,
  computeCrossRootCollisions,
  currentBranch,
  defaultBranch,
  discoverRoots,
  formatTotals,
  renderMachine,
  runHarnessForSpecs,
  specIdOf,
  STAGE_ORDER,
  validateCapability,
  validateChange,
  type ChangeIssue,
  type CrossRootCollision,
  type HarnessGate,
  type RootNamespaceValues,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  assertCompactJsonPairing,
  CliError,
  cliMaxScanDepth,
  exitWith,
  loadCliConfig,
  loadRootSpecEntries,
  reRootContext,
  addSpecDirOption,
  specsPrefixFor,
  resolveChangeIdOrExit,
  resolveOutMode,
  type CliContext,
} from '../cli-shared.ts';
import { makeCliHarnessRunner } from '../harness.ts';
import { makeIo } from '../io.ts';

interface VItem {
  id: string;
  type: string;
  valid: boolean;
  issues: ChangeIssue[];
  durationMs: number;
  matchedViaPrefix: boolean;
}

/** predecessor validate ordering: id asc, tie-broken by type asc. */
function compareItems(a: VItem, b: VItem): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : a.type.localeCompare(b.type);
}

/**
 * r115: `entries` is required — spec validation MUST run on the resolved
 * instance's own registry, never on a silently ambient-cwd default.
 */
function specV1Items(
  opts: {
    harness?: HarnessGate;
    harnessOnlyIds?: string[];
  },
  entries: ReturnType<typeof loadRootSpecEntries>,
): VItem[] {
  const duplicatesFor = buildDuplicatesFor(entries);

  const items: VItem[] = [];
  for (const entry of entries) {
    const cap = specIdOf(entry);
    const verdict = validateCapability(entry as never, duplicatesFor);
    const issues: ChangeIssue[] = verdict.items.map((i) => ({
      level: i.level,
      path: i.id,
      message: i.message,
    }));
    items.push({
      id: cap,
      type: 'spec',
      valid: issues.every((i) => i.level !== 'ERROR'),
      issues,
      durationMs: 0,
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

function changeV1Items(
  ctx: CliContext,
  names: string[],
  opts: { stage?: string; strict?: boolean },
): VItem[] {
  const { io, root, git } = ctx;
  const config = loadCliConfig(root);
  const items: VItem[] = [];
  for (const name of names) {
    const res = validateChange(
      io,
      root,
      name,
      {
        strict_defer: config?.archive?.strict_defer ?? null,
        change_id_pattern: config?.change_id?.pattern ?? null,
      },
      {
        stage: opts.stage as never,
        strict: opts.strict === true,
        git,
        // r119: specs-landing judged under this instance's prefix.
        specsPrefix: specsPrefixFor(ctx),
      },
    );
    items.push({
      id: name,
      type: 'change',
      valid: res.valid,
      issues: res.issues,
      durationMs: 0,
      matchedViaPrefix: false,
    });
  }
  // r87: global change-id uniqueness gate. Duplicate ids attach to their
  // active change item when the active change is being validated; archive↔
  // archive / frozen-only collisions surface as synthetic items (no active
  // counterpart to carry the ERROR).
  const duplicates = checkGlobalChangeIdUniqueness(io, `${root}/llmanspec/changes`);
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
        matchedViaPrefix: false,
      });
    }
  }
  items.sort(compareItems);
  return items;
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
  }
  console.log(formatTotals(passed, failed, items.length));
}

/**
 * r91/r114 human form: the cross-root observation section, closing with the
 * `--directory` remediation hint. Machine formats carry the data only (no
 * hint line) — the hint is a human-presentation artifact.
 */
function renderCrossRootCollisions(collisions: readonly CrossRootCollision[]): void {
  if (collisions.length === 0) {
    console.log('Cross-root id collisions: none');
  } else {
    console.log('Cross-root id collisions (same id under multiple roots is legal):');
    for (const collision of collisions) {
      console.log(`  ${collision.namespace}/${collision.value}: ${collision.roots.join(', ')}`);
    }
  }
  console.log(
    'Use --directory <path> to target one instance root; collisions never affect the exit code.',
  );
}

function gitToplevelOrCwd(ctx: CliContext): string {
  const toplevel = ctx.git.runOpt(['rev-parse', '--show-toplevel']);
  return toplevel ?? ctx.root;
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
  '- Ensure each .feature has a non-empty "# purpose:" header and a Feature title matching the assigned spec id',
  '- Each requirement MUST include at least one scenario object',
  '- Re-run with --json to see structured report',
];
const CHANGE_NEXT_STEPS = [
  '- Edit live single-track specs (`llmanspec/specs/<capability>.feature`) on the feature branch (@human constraints and @executable acceptance share one track, linked via @req); run `llman-sdd change start <id>` or `change attach <id>`',
  '- Ensure proposal.md, design.md (if needed), and tasks.md are complete before apply',
  '- Debug change state: llman-sdd show <id> --json --type change',
];

/** r63: default-branch dirty live specs — workspace-level guard, once per run. */
function warnDirtySpecsOnDefaultBranch(ctx: CliContext): void {
  const { git } = ctx;
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
 * r13/r48 trigger state: the nested guard env and the check flag are read
 * here (CLI boundary) and injected into core as parameters — core harness
 * logic never touches process.env. Commander binary state:
 * --check → check=true, absent → undefined.
 */
function makeHarnessGate(ctx: CliContext, options: { check?: boolean }): HarnessGate {
  const runCommand = loadCliConfig(ctx.root)?.specs?.check_command ?? null;
  const configured = runCommand !== null && runCommand !== '';
  return {
    nested: process.env.LLMAN_SDD_HARNESS_ACTIVE === '1',
    // Opt-in harness (2026-10 decision): absent → 'off' — structure/state gate
    // only; --check → 'on' (explicit full harness). The CLI never sends
    // 'default'; core still treats a received 'default' as
    // run-if-configured (its own contract).
    check: options.check === true ? 'on' : 'off',
    runner: configured ? makeCliHarnessRunner() : undefined,
    runCommand,
    cwd: ctx.root,
    onBeforeFirstRun: (expanded: string): void => {
      if (harnessBannerShown) return;
      harnessBannerShown = true;
      console.error(`running spec check: ${expanded} (explicit --check harness run)`);
    },
  };
}

export function registerValidate(program: Command, ctx: CliContext): void {
  const validate = program
    .command('validate')
    .description('Validate specs and changes (structural gates + stage/completion rules)')
    .argument('[item]', 'spec id or change id (auto-disambiguated)')
    .option('--all', 'validate all specs and all changes')
    .option('--changes', 'restrict scope to changes')
    .option('--specs', 'restrict scope to specs')
    .option('--type <type>', 'force disambiguation: change | spec')
    .option('--stage <stage>', 'change stage gate: draft | designed | planned | full')
    .option('--strict', 'warnings also make the exit code non-zero');
  addSpecDirOption(validate);
  validate
    .option(
      '--all-roots',
      'aggregate: validate every discovered llmanspec root (specs scope, any root red → non-zero exit)',
    )
    .option('--include-info', 'keep INFO-level issues (default: WARNING and above)')
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
      assertCompactJsonPairing(options);
      const outMode = resolveOutMode(options.output, options.json, options.compactJson);
      // r32: INFO issues are presentation noise — dropped unless opted in.
      // Filtering never touches `valid`, summaries, or exit codes.
      const keepInfo = options.includeInfo === true;
      const stripInfo = <T extends { issues: { level: string }[] }>(it: T): T =>
        keepInfo ? it : { ...it, issues: it.issues.filter((x) => x.level !== 'INFO') };
      warnDirtySpecsOnDefaultBranch(ctx);
      if (options.type !== undefined && options.type !== 'change' && options.type !== 'spec') {
        throw new CliError(`invalid --type: ${options.type}`, 2);
      }
      if (
        options.stage !== undefined &&
        !(STAGE_ORDER as readonly string[]).includes(options.stage)
      ) {
        throw new CliError(`invalid --stage: ${options.stage}`, 2);
      }
      const maxDepth = cliMaxScanDepth(program);

      // ---- aggregate over every discovered root (r91) ----
      if (options.allRoots === true) {
        if (item !== undefined) {
          throw new CliError('--all-roots validates every root; drop the <item> argument');
        }
        const start = resolve(options.directory ?? gitToplevelOrCwd(ctx));
        const roots = discoverRoots(start, ctx.io, { maxDepth });
        if (roots.length === 0) {
          // r91 aggregate anchor: discovery covers the start itself and
          // everything below it — the r109 walk-up family message form, with
          // the direction the aggregate operator actually searches.
          throw new CliError(`no llmanspec root at or under: ${start}`);
        }
        const reports: RootReport[] = [];
        const namespaceValues: RootNamespaceValues[] = [];
        let anyFail = false;
        for (const root of roots) {
          // r91/r115: the discovered rootDir follows the start's form, and a
          // relative one would make makeIo(rootDir) anchor twice (queries
          // landing in <dir>/<dir>/llmanspec) so every root failed to resolve.
          // Absolutize once, then label relative to the (absolute) start.
          const rootDir = resolve(root.rootDir);
          const rootCtx: CliContext = {
            ...ctx,
            root: rootDir,
            io: makeIo(rootDir),
          };
          const entries = loadRootSpecEntries(rootDir, rootCtx.io);
          const items = specV1Items(
            {
              harness: makeHarnessGate(rootCtx, options),
            },
            entries,
          );
          const visible = keepInfo ? items : items.map(stripInfo);
          if (visible.some((i) => !i.valid)) anyFail = true;
          const label = relative(start, rootDir) || '.';
          reports.push({
            root: label,
            items: visible,
            summary: summarizeItems(visible),
          });
          // r91: the aggregate covers change-id granularity too — one set of
          // ids per root for the cross-root observation (spec/capability ids,
          // @req handles, change ids incl. archived dated entries).
          namespaceValues.push({
            root: label,
            specIds: entries.map((entry) => specIdOf(entry)),
            reqIds: entries
              .flatMap((entry) => entry.doc.rules.map((rule) => rule.reqId))
              .filter((id) => id !== ''),
            changeIds: collectChangeIdValues(rootCtx.io, `${rootDir}/llmanspec/changes`, {
              maxScanDepth: maxDepth,
            }),
          });
        }
        // r91/r114: undefined for a lone root — the field MUST NOT be emitted
        // at all there (no empty array, byte-identical single-root output).
        const collisions = computeCrossRootCollisions(namespaceValues);
        if (outMode === 'human') {
          for (const report of reports) {
            console.log(`root ${report.root}`);
            renderValidateText(report.items);
          }
          if (collisions !== undefined) renderCrossRootCollisions(collisions);
        } else {
          const totals = reports.reduce(
            (acc, r) => ({
              items: acc.items + r.summary.totals.items,
              passed: acc.passed + r.summary.totals.passed,
              failed: acc.failed + r.summary.totals.failed,
            }),
            { items: 0, passed: 0, failed: 0 },
          );
          // Observation is data-only in machine form (r114: no hint line);
          // collisions never feed the exit code.
          const payload =
            collisions === undefined
              ? { roots: reports, summary: { totals }, version: '1.0' }
              : {
                  roots: reports,
                  crossRootCollisions: collisions,
                  summary: { totals, crossRootCollisions: collisions.length },
                  version: '1.0',
                };
          console.log(renderMachine(payload, outMode));
        }
        if (anyFail) console.error('Error: validation failed');
        exitWith(anyFail ? 1 : 0);
        return;
      }

      // ---- instance root resolution (T21, cli r108/r109/r115): the shared
      // re-root operator, same as every other command — io, git and root are
      // all anchored at the resolved instance, so downstream discovery reads
      // THAT root (a root swap alone would still discover from the launch
      // cwd). Byte-identical when cwd already sits at the instance root. ----
      const eff: CliContext = reRootContext(ctx, options.directory);

      const harness = makeHarnessGate(eff, options);

      // ---- single item (auto-disambiguate: spec first, then change) ----
      if (item !== undefined) {
        const entries = loadRootSpecEntries(undefined, eff.io);
        const specEntry =
          options.type === 'change' ? undefined : entries.find((e) => specIdOf(e) === item);
        if (specEntry !== undefined) {
          const items = specV1Items(
            {
              harness,
              harnessOnlyIds: [item],
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
          if (!shown.valid) console.error('Error: validation failed');
          exitWith(shown.valid ? 0 : 1);
          return;
        }
        // change single (r61: predecessor r112 prefix resolution on the change id)
        const { io, root } = eff;
        const resolved = resolveChangeIdOrExit(eff, program, item, {
          suppressHint: options.json === true,
        });
        const changeId = resolved.id;
        const res = validateChange(
          io,
          root,
          changeId,
          {
            strict_defer: loadCliConfig(eff.root)?.archive?.strict_defer ?? null,
            change_id_pattern: loadCliConfig(eff.root)?.change_id?.pattern ?? null,
          },
          {
            stage: options.stage as never,
            strict: options.strict === true,
            git: eff.git,
            // r119: specs-landing judged under this instance's prefix.
            specsPrefix: specsPrefixFor(eff),
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
          specV1Items(
            {
              harness,
            },
            loadRootSpecEntries(undefined, eff.io),
          ),
        );
      }
      if (effectiveChanges) {
        const names = collectChanges(eff.io, eff.root, new Date(), {
          maxScanDepth: maxDepth,
        }).map((c) => c.name);
        items = items.concat(
          changeV1Items(eff, names, { stage: options.stage, strict: options.strict }),
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
