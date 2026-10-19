/**
 * Leaf module shared by every command group: version/templateIo wiring, config
 * readers, change-id resolution, output-mode helpers and misc constants.
 * Command modules depend one-way on this file; it must not import any of them.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  discoverSpecs,
  embeddedTemplates,
  loadConfig,
  loadConfigDetail,
  makeEmbeddedTemplateIo,
  readSddState,
  resolveChangeId,
  resolveInstanceRoot,
  renderMachine,
  semverLt,
  type TemplateIo,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import pkg from '../package.json' with { type: 'json' };
import { makeCliGit, makeIo } from './io.ts';

// Re-exported so leaf consumers (e.g. regression gates under tests/) can type
// against the commander surface without resolving 'commander' themselves.
export type { Command } from 'commander';

/**
 * T21 CliContext (cli r108): the per-run resolution injected into every
 * registerXxx — terminal IO, git port, instance root and working directory.
 * Constructed once by `makeCliContext` at assembly time; command bodies take
 * io/git/root from here instead of reading process state ad hoc.
 */
export interface CliContext {
  io: ReturnType<typeof makeIo>;
  git: ReturnType<typeof makeCliGit>;
  root: string;
  cwd: string;
}

/** Build the run context for `cwd` (defaults to the launch directory). */
export function makeCliContext(cwd: string = process.cwd()): CliContext {
  return { io: makeIo(cwd), git: makeCliGit(cwd), root: cwd, cwd };
}

// Version SSOT is this package's package.json (inlined at compile time — a
// single-file binary has no on-disk package.json to read); binary builds
// additionally override it through the LLMAN_SDD_VERSION define injected by
// scripts/build-binary.ts (git tag > package version).

// Injected at binary build time by scripts/build-binary.ts; falls back to the
// package version when running from source.
const baseVersion = process.env.LLMAN_SDD_VERSION ?? pkg.version;

/**
 * Dev-tree marker (`+dirty.N`): appended when the checkout has uncommitted
 * changes, so `--version` / drift notices distinguish "released build" from
 * "hacking on the library" at a glance. Best-effort — git failure keeps the
 * plain version; cached per process.
 */
let dirtySuffix: string | null | undefined;

function computeDirtySuffix(): string {
  // Dual-runtime surface: `node:child_process.spawnSync` (not `Bun.spawnSync`).
  // It reports a missing git binary through `error` and a non-zero exit through
  // `status` instead of throwing, so the degradation is explicit — a wide catch
  // around this block would also swallow ReferenceError from the parsing below.
  const probe = spawnSync('git', ['status', '--porcelain'], {
    cwd: import.meta.dirname,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (probe.error !== undefined || probe.status !== 0) return '';
  const lines = (probe.stdout?.toString() ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  return lines.length > 0 ? `+dirty.${lines.length}` : '';
}

export function versionDisplay(): string {
  dirtySuffix ??= computeDirtySuffix();
  return `${baseVersion}${dirtySuffix}`;
}

/** Package version without the dirty suffix (drift comparison baseline). */
export const version: string = baseVersion;

// Compiled single-file binaries have no on-disk templates and Bun <= 1.4.x has
// no embedding mechanism, so scripts/build-binary.ts injects the template
// table through the literal define `process.env.LLMAN_SDD_EMBEDDED_TEMPLATES`
// (define only rewrites literal member access — the read must stay here, not
// in core); every non-compiled run keeps reading the real filesystem (npm/
// source/Node). Both init and `review --export-html` resolve through this one
// seam.
const embedded = embeddedTemplates(process.env.LLMAN_SDD_EMBEDDED_TEMPLATES);
export const templateIo: TemplateIo = embedded
  ? makeEmbeddedTemplateIo(embedded)
  : {
      exists: (p) => existsSync(p),
      readText: (p) => readFileSync(p, 'utf8'),
    };

/** CLI io rooted at the launch cwd; call at action time so cwd is read per command. */
export function newIo(): ReturnType<typeof makeIo> {
  return makeIo(process.cwd());
}

/**
 * D5: unified error export. Domain/usage errors thrown from command actions
 * surface as a single `Error: <message>` line via main.ts with the carried
 * exit code — commands must NOT set `process.exitCode` directly.
 */
export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

/** Single exit-code write point for non-error result paths (e.g. sweep verdicts). */
export function exitWith(code: number): void {
  process.exitCode = code;
}

/**
 * Per-root specs dir (r94): the nearest llmanspec/ instance at or above the
 * start dir (--directory override). Identity 'llmanspec/specs' when the cwd
 * is itself the instance root — legacy relative output paths stay
 * byte-identical there.
 */
export function resolveRootSpecsDir(
  directory?: string,
  io: ReturnType<typeof makeIo> = newIo(),
): string {
  // r115: the default start is the io's own anchor, NOT the ambient cwd — a
  // re-rooted io (reRootContext) must discover its own instance, otherwise
  // every re-rooted read silently falls back to the launch directory.
  const start = directory ?? io.root;
  const root = resolveInstanceRoot(start, io);
  if (root === null) {
    throw new CliError(`no llmanspec root at or above: ${start}`);
  }
  // r115: the legacy relative identity is only valid when the resolved
  // instance IS this io's own anchor (the single-root default) — there the
  // returned path means `llmanspec/specs` relative to that very anchor, never
  // to the ambient cwd. Every other instance is addressed absolutely, so a
  // caller consuming the result with its own io cannot re-join a
  // launch-relative path into a non-existent directory (which would silently
  // empty the registry and turn a red gate green).
  const absolute = isAbsolute(root) ? root : resolve(io.root, root);
  return sameDir(absolute, io.root) ? 'llmanspec/specs' : join(absolute, 'llmanspec', 'specs');
}

/** Path identity by absolute resolution (`a` and `b` denote the same directory). */
function sameDir(a: string, b: string): boolean {
  return resolve(a) === resolve(b);
}

/** Spec entries of the resolved instance root (per-root registry, r94). */
export function loadRootSpecEntries(
  directory?: string,
  io: ReturnType<typeof makeIo> = newIo(),
): ReturnType<typeof discoverSpecs> {
  return discoverSpecs(resolveRootSpecsDir(directory, io), io);
}

/** One-time legacy `bdd:` migration warning — printed to stderr by the first
 * config-reading command of a process (specs-check-config-and-unbound-feed). */
let legacyBddWarningShown = false;

function warnLegacyBdd(elevated: boolean): void {
  if (!elevated || legacyBddWarningShown) return;
  legacyBddWarningShown = true;
  console.error(
    '[WARNING] llmanspec/config.yaml uses the legacy `bdd:` section — migrate to `specs:` (`bdd.run_command` → `specs.check_command`). See migrations/v0.5-v0.6/README.md.',
  );
}

/** One-time removed-key warning (config-schema r102): `specs.check_transitions`
 * is stripped at load; transition validation is tag-scoped (validation r104). */
let legacyCheckTransitionsWarningShown = false;

function warnLegacyCheckTransitions(stripped: boolean): void {
  if (!stripped || legacyCheckTransitionsWarningShown) return;
  legacyCheckTransitionsWarningShown = true;
  console.error(
    '[WARNING] llmanspec/config.yaml `specs.check_transitions` was removed — transition-table validation is now tag-scoped per scenario (@transitions force / @no-transitions escape). Delete the key. See migrations/v0.8-v0.9/README.md.',
  );
}

/** Surface the legacy-section warnings from a raw config source (config command). */
export function warnLegacyBddOnce(source: string): void {
  if (legacyBddWarningShown && legacyCheckTransitionsWarningShown) return;
  const detail = loadConfigDetail(source);
  warnLegacyBdd(detail.legacyBddElevated);
  warnLegacyCheckTransitions(detail.legacyCheckTransitionsStripped);
}

/**
 * Version-drift notice (version-awareness): when the project was scaffolded by
 * an older llman-sdd, surface one stderr line per process so humans and agents
 * see the update hint. Silent-OK when no/corrupt state; never load-bearing;
 * no override flags by design (noise is bounded by once-per-process + strict
 * older-than comparison).
 */
let versionDriftShown = false;

export function noteVersionDriftOnce(root: string = process.cwd()): void {
  if (versionDriftShown) return;
  versionDriftShown = true;
  const io = makeIo(root);
  const state = readSddState(io);
  if (state === null) return;
  if (!semverLt(state.cli_version, version)) return;
  console.error(
    `[NOTE] this project was scaffolded with llman-sdd ${state.cli_version}; installed CLI is ${version}. Skill templates/behaviour may have changed — review the changelog and run \`llman-sdd init --update\`.`,
  );
}

export function loadCliConfig(root: string = process.cwd()): ReturnType<typeof loadConfig> | null {
  const configPath = join(root, 'llmanspec', 'config.yaml');
  if (!existsSync(configPath)) return null;
  const detail = loadConfigDetail(readFileSync(configPath, 'utf8'));
  warnLegacyBdd(detail.legacyBddElevated);
  warnLegacyCheckTransitions(detail.legacyCheckTransitionsStripped);
  if (root === process.cwd()) noteVersionDriftOnce();
  return detail.config;
}

export function cliMaxScanDepth(program: Command): number {
  const raw = program.opts().maxScanDepth as string | undefined;
  const n = raw !== undefined ? Number(raw) : 8;
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError(`--max-scan-depth must be >= 1 (got ${raw})`, 2);
  }
  return n;
}

/**
 * r61: shared predecessor r112 change id resolution for every change-taking command.
 * Emits the `(prefix match)` hint on stderr; fails by throwing CliError (the
 * unified exit renders the single `Error: <message>` line and exit code 1).
 */
export function resolveChangeIdOrExit(
  ctx: CliContext,
  program: Command,
  input: string,
  opts: { suppressHint?: boolean } = {},
): { id: string; viaPrefix: boolean } {
  const resolved = resolveChangeId(ctx.io, ctx.root, input, {
    maxScanDepth: cliMaxScanDepth(program),
  });
  if (resolved.viaPrefix && opts.suppressHint !== true) {
    console.error(`'${input}' -> '${resolved.id}' (prefix match)`);
  }
  return resolved;
}

export type OutMode = 'toon' | 'json' | 'compact-json' | 'human';

/**
 * D4: shared output-flag surface for every report command. Mounts the unified
 * `--output <toon|json|compact-json|human>` plus the predecessor-compatibility alias
 * flags (`--json` / `--compact-json`), so report commands no longer duplicate
 * `.option('--output', ...)` registrations. `outputHint` lets a command keep a
 * richer value-domain description (show's legacy JSON modifiers).
 */
export function addReportOutputOptions(cmd: Command, opts: { outputHint?: string } = {}): void {
  cmd
    .option(
      '--output <mode>',
      opts.outputHint ?? 'report format: toon (default) | json | compact-json | human',
    )
    .option('--json', 'emit structured JSON (v1 compatibility alias)')
    .option(
      '--compact-json',
      'single-line JSON alias; must pair with --json (not with --output toon|human)',
    );
}

/**
 * toon-default-output: explicit `--output` wins, then the predecessor-parity legacy
 * flags, then the toon default. Legacy `--compact-json` keeps its predecessor guard
 * (must pair with `--json`) — standalone compact goes through `--output`.
 * Invalid `--output` values are usage errors (exit 2) and throw CliError.
 */
export function resolveOutMode(
  output: string | undefined,
  legacyJson: boolean | undefined,
  legacyCompact: boolean | undefined,
): OutMode {
  const modes: readonly string[] = ['toon', 'json', 'compact-json', 'human'];
  if (output !== undefined) {
    if (!modes.includes(output)) {
      throw new CliError(`invalid --output: ${output} (toon | json | compact-json | human)`, 2);
    }
    return output as OutMode;
  }
  if (legacyCompact) return 'compact-json';
  if (legacyJson) return 'json';
  return 'toon';
}

/**
 * Legacy `--compact-json` guard (see resolveOutMode): standalone compact is
 * rejected (usage error, exit 2) unless paired with `--json` or an explicit
 * `--output`.
 */
export function assertCompactJsonPairing(options: {
  compactJson?: boolean;
  json?: boolean;
  output?: string;
}): void {
  // r76: `--compact-json` is a pairing modifier of `--json`. Standalone use is
  // rejected; combining with an explicit `--output toon|human` is ambiguous
  // (two modes requested) and equally a usage error.
  if (options.compactJson === true && options.json !== true) {
    if (options.output === undefined || options.output === 'toon' || options.output === 'human') {
      throw new CliError('--compact-json requires --json', 2);
    }
  }
}

export const SKILL_DESCRIPTIONS: Record<string, string> = {
  'llman-sdd-continue': 'Fill in missing change artifacts',
  'llman-sdd-ff': 'Fast-forward propose: planning shell → Branch binding → Specs landing',
  'llman-sdd-validate': 'Standalone validation skill',
  'llman-sdd-arch-review': 'Scan shallow modules for deepening candidates',
  'llman-sdd-wayfinder': 'Plan large foggy work as a decision map',
  'llman-sdd-research': 'Delegate external research to a background agent',
};
export const skillDesc = (name: string): string => SKILL_DESCRIPTIONS[name] ?? '';

export function resolveBackend(flag: string | undefined): 'pageindex' {
  // r57 normalization: trim, lowercase, `page-index` alias; blank values
  // (unset flag / empty env) collapse to the pageindex default.
  const raw = flag ?? process.env.LLMAN_SDD_INDEX_BACKEND ?? '';
  const chosen = raw.trim() === '' ? 'pageindex' : raw.trim().toLowerCase();
  if (chosen === 'rag') {
    throw new Error(
      'Backend `rag` is no longer supported. Use the default pageindex backend instead:\nSet `LLMAN_SDD_INDEX_CHAT_MODEL` to a tool-calling chat model, then\nrun `llman-sdd index rebuild`.',
    );
  }
  const normalized = chosen === 'page-index' ? 'pageindex' : chosen;
  if (normalized !== 'pageindex') {
    throw new Error(`Unsupported backend: ${chosen}`);
  }
  return 'pageindex';
}

/**
 * Tolerant specs-dir half of the root fork (show gates trailer): bare
 * changes-only workspaces have no resolvable instance root; there the legacy
 * relative identity is kept so discovery yields an empty set (predecessor
 * behavior) instead of failing the change path.
 *
 * r115: the dir is derived from the ALREADY re-anchored context alone. The
 * resolved instance root decides the registry, so the two output faces of one
 * command cannot disagree; re-resolving `--directory` from the launch context
 * would return a launch-relative path that the re-anchored io re-joins into a
 * non-existent directory, silently emptying the gate.
 */
export function resolveRootSpecsDirTolerant(ctx: CliContext): string {
  try {
    return resolveRootSpecsDir(undefined, ctx.io);
  } catch {
    return 'llmanspec/specs';
  }
}

/**
 * r115/r116/r118: re-root a command context onto the resolved instance root.
 * Start = `--directory` when given, else the launch root, through the shared
 * operator (nearest valid instance at or above it). The returned io/git are
 * anchored at that root, so root-relative read AND write paths (e.g. the
 * `llmanspec/.context` index store) stay inside the resolved instance instead
 * of the launch directory. When the launch directory already is the instance
 * — every single-root invocation — the original context is returned untouched,
 * so byte parity holds by construction.
 */
export function reRootContext(ctx: CliContext, directory?: string): CliContext {
  const resolved = resolveCommandRoot(ctx, directory);
  const root = isAbsolute(resolved) ? resolved : resolve(ctx.cwd, resolved);
  if (root === ctx.root) return ctx;
  return { io: makeIo(root), git: makeCliGit(root), root, cwd: ctx.cwd };
}

/**
 * r108/r109: the single root-resolution operator. Start = `--directory` when
 * given, else the launch root; resolves the nearest instance at or above it
 * (the launch root itself when it already is one — single-root byte parity).
 * Throws the shared domain error when no instance exists at or above start.
 */
export function resolveCommandRoot(ctx: CliContext, directory?: string): string {
  // r109/r115: the start is absolutized at this CLI boundary — a relative
  // `--directory` (`packages`, `..`, `.`) is relative to the process cwd, and
  // the core walk-up cannot climb above a single-segment relative name (its
  // parent is the empty string, which terminates the walk). The returned root
  // is therefore always absolute, so every downstream path/io join stays
  // single-anchored. The error keeps the user's own spelling of the start.
  const given = directory ?? ctx.root;
  const root = resolveInstanceRoot(resolve(given), ctx.io);
  if (root === null) throw new CliError(`no llmanspec root at or above: ${given}`);
  return root;
}

/**
 * r109: the shared `--directory <path>` instance-root override, one declared
 * surface mounted on every command that resolves a root.
 */
export function addSpecDirOption(cmd: Command): void {
  cmd.option(
    '--directory <path>',
    'instance root resolution start (default: nearest llmanspec/ at or above cwd)',
  );
}

/**
 * r119: the specs-landed prefix for ctx's instance root — the same
 * git-toplevel-relative derivation as the r118 number harvest
 * (`harvestForRoot`), so the close-out gate and the harvest can never
 * disagree about which `llmanspec/` tree a change belongs to. Forward slashes
 * always: git diff --name-only emits them on every platform.
 */
export function specsPrefixFor(ctx: CliContext): string {
  const top = ctx.git.runOpt(['rev-parse', '--show-toplevel']) ?? ctx.root;
  const rel = relative(top, resolve(ctx.root)).split(sep).join('/');
  return rel === '' ? 'llmanspec/specs/' : `${rel}/llmanspec/specs/`;
}

/**
 * T18 emitReport (design 2.2): the single output pipeline for report commands
 * — pairing guard, out-mode resolution, machine render, human fallback. The
 * machine branch always `console.log`s the rendered payload; `humanFn` (when
 * given) produces the human text instead. Byte-for-byte identical to the
 * per-command logic it replaces.
 */
export function emitReport(
  ir: unknown,
  options: { output?: string; json?: boolean; compactJson?: boolean },
  humanFn?: () => string,
): void {
  assertCompactJsonPairing(options);
  const mode = resolveOutMode(options.output, options.json, options.compactJson);
  if (mode === 'human') {
    if (humanFn === undefined) throw new CliError('human renderer missing for human mode', 2);
    console.log(humanFn());
    return;
  }
  console.log(renderMachine(ir, mode));
}
