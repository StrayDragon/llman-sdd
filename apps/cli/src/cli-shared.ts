/**
 * Leaf module shared by every command group: version/templateIo wiring, config
 * readers, change-id resolution, output-mode helpers and misc constants.
 * Command modules depend one-way on this file; it must not import any of them.
 */
import { existsSync, readFileSync } from 'node:fs';

import {
  discoverSpecs,
  embeddedTemplates,
  loadConfig,
  makeEmbeddedTemplateIo,
  resolveChangeId,
  type TemplateIo,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import pkg from '../package.json' with { type: 'json' };
import { makeIo } from './io.ts';

// Re-exported so leaf consumers (e.g. regression gates under tests/) can type
// against the commander surface without resolving 'commander' themselves.
export type { Command } from 'commander';

// Version SSOT is this package's package.json (inlined at compile time — a
// single-file binary has no on-disk package.json to read); binary builds
// additionally override it through the LLMAN_SDD_VERSION define injected by
// scripts/build-binary.ts (git tag > package version).

// Injected at binary build time by scripts/build-binary.ts; falls back to the
// package version when running from source.
export const version = process.env.LLMAN_SDD_VERSION ?? pkg.version;

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

/** Parse all capability specs under llmanspec/specs via core discovery. */
export function loadSpecEntries(): ReturnType<typeof discoverSpecs> {
  return discoverSpecs('llmanspec/specs', newIo());
}

export function loadCliConfig(): ReturnType<typeof loadConfig> | null {
  return existsSync('llmanspec/config.yaml')
    ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'))
    : null;
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
 * r61: shared v1-r112 change id resolution for every change-taking command.
 * Emits the `(prefix match)` hint on stderr; fails by throwing CliError (the
 * unified exit renders the single `Error: <message>` line and exit code 1).
 */
export function resolveChangeIdOrExit(
  program: Command,
  input: string,
  opts: { suppressHint?: boolean } = {},
): { id: string; viaPrefix: boolean } {
  const resolved = resolveChangeId(newIo(), process.cwd(), input, {
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
 * `--output <toon|json|compact-json|human>` plus the v1-compatibility alias
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
    .option('--compact-json', 'emit single-line JSON (v1 compatibility alias)');
}

/**
 * toon-default-output: explicit `--output` wins, then the v1-parity legacy
 * flags, then the toon default. Legacy `--compact-json` keeps its v1 guard
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
}): boolean {
  if (options.compactJson === true && options.json !== true && options.output === undefined) {
    throw new CliError('--compact-json requires --json', 2);
  }
  return true;
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
