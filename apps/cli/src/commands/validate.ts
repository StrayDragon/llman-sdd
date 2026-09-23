import {
  applyStrict,
  buildDuplicatesFor,
  collectChanges,
  currentBranch,
  defaultBranch,
  evaluateStaleness,
  formatTotals,
  notApplicableStaleness,
  renderMachine,
  specRelFor,
  specIdOf,
  STAGE_ORDER,
  validateCapability,
  validateChange,
  type ChangeIssue,
  type StalenessInfo,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  assertCompactJsonPairing,
  cliMaxScanDepth,
  loadCliConfig,
  loadSpecEntries,
  newIo,
  resolveChangeIdOrExit,
  resolveOutMode,
} from '../cli-shared.ts';
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

/** v1 validate ordering: id asc, tie-broken by type asc. */
function compareItems(a: VItem, b: VItem): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : a.type.localeCompare(b.type);
}

function specV1Items(
  opts: { strict?: boolean },
  entries: ReturnType<typeof loadSpecEntries> = loadSpecEntries(),
): VItem[] {
  const io = newIo();
  const git = makeCliGit(process.cwd());
  const duplicatesFor = buildDuplicatesFor(entries);

  const items: VItem[] = [];
  for (const entry of entries) {
    const cap = specIdOf(entry);
    const verdict = validateCapability(entry as never, duplicatesFor, io, {
      strict: opts.strict === true,
    });
    const specRel = specRelFor(entry.fileName);
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

export function registerValidate(program: Command): void {
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
          const entries = loadSpecEntries();
          const specEntry =
            options.type === 'change' ? undefined : entries.find((e) => specIdOf(e) === item);
          if (specEntry !== undefined) {
            const items = specV1Items({ strict: options.strict }, entries);
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
          const resolved = resolveChangeIdOrExit(program, item, {
            suppressHint: options.json === true,
          });
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
            for (const info of infos)
              console.error(`[${info.level}] ${info.path}: ${info.message}`);
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
            maxScanDepth: cliMaxScanDepth(program),
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
}
