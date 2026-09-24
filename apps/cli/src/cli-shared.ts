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

// Version SSOT is this package's package.json (inlined at compile time — a
// single-file binary has no on-disk package.json to read); binary builds
// additionally override it through the LLMAN_SDD_VERSION define injected by
// scripts/build-binary.ts (git tag > package version).
import pkg from '../package.json' with { type: 'json' };
import { makeIo } from './io.ts';

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

/** Parse all capability specs under llmanspec/specs via core discovery. */
export function loadSpecEntries(): ReturnType<typeof discoverSpecs> {
  return discoverSpecs('llmanspec/specs', newIo());
}

export function loadCliConfig(): ReturnType<typeof loadConfig> | null {
  return existsSync('llmanspec/config.yaml')
    ? loadConfig(readFileSync('llmanspec/config.yaml', 'utf8'))
    : null;
}

/**
 * Historical unchecked variant: since core loadConfig compiles
 * change_id.pattern at load time (r59) the two are behaviorally identical;
 * kept as a thin alias for the `change archive` / `spec skeleton` / `review`
 * call sites (removal registered with the second wave).
 */
export function loadCliConfigUnchecked(): ReturnType<typeof loadConfig> | null {
  return loadCliConfig();
}

export function cliMaxScanDepth(program: Command): number {
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
export function resolveChangeIdOrExit(
  program: Command,
  input: string,
  opts: { suppressHint?: boolean } = {},
): { id: string; viaPrefix: boolean } | null {
  try {
    const resolved = resolveChangeId(newIo(), process.cwd(), input, {
      maxScanDepth: cliMaxScanDepth(program),
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

export type OutMode = 'toon' | 'json' | 'compact-json' | 'human';

/**
 * toon-default-output: explicit `--output` wins, then the v1-parity legacy
 * flags, then the toon default. Legacy `--compact-json` keeps its v1 guard
 * (must pair with `--json`) — standalone compact goes through `--output`.
 */
export function resolveOutMode(
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

/**
 * Legacy `--compact-json` guard (see resolveOutMode): standalone compact is
 * rejected unless paired with `--json` or an explicit `--output`.
 */
export function assertCompactJsonPairing(options: {
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
