/**
 * BDD harness execution for validate (validation capability, r13/r48):
 * expands bdd.run_command per capability, executes each expanded command
 * string at most once per validate invocation (batch-once), and maps results
 * to per-capability issues. Pure — the subprocess runs through the injected
 * HarnessRunner; this module never reads the environment or the wall clock
 * (the nested-invocation guard is read by the CLI and passed in as a
 * parameter).
 */
import type { ValidationItem } from './validate.ts';

/**
 * Harness runner port (r13/r48): executes one expanded bdd.run_command
 * string; the CLI adapter owns the subprocess (and the nested-invocation
 * guard env it exports). exitCode is null only when the command could not
 * start (spawnError then carries the reason). Lives here rather than in
 * ports.ts so the validation module gains no new cross-module edge (r72).
 */
export interface HarnessRunner {
  run(
    command: string,
    cwd: string,
  ): {
    exitCode: number | null;
    output: string;
    spawnError?: string;
  };
}

export interface HarnessTarget {
  /** Capability id ({feature_name}). */
  capability: string;
  /** Repo-root-relative path of the capability's main .feature file. */
  featurePath: string;
}

/** Trigger state assembled by the CLI (env guard + flags + config + runner). */
export interface HarnessGate {
  /** LLMAN_SDD_HARNESS_ACTIVE=1 was set by an enclosing validate invocation. */
  nested: boolean;
  check: 'default' | 'on' | 'off';
  /** Undefined when bdd.run_command is not configured (non-empty string). */
  runner: HarnessRunner | undefined;
  runCommand: string | null;
  /** Project root — the cwd every harness subprocess runs in. */
  cwd: string;
  /** CLI emits its one-line stderr banner through this hook before the first execution. */
  onBeforeFirstRun?: (expanded: string) => void;
}

export interface HarnessRunOutcome {
  /** Harness issues per capability, in target order. */
  issuesByCapability: Map<string, ValidationItem[]>;
  /** True when at least one command actually executed in this call. */
  executed: boolean;
}

/** Plain-text placeholder expansion — capability ids are kebab-constrained. */
export function expandRunCommand(command: string, target: HarnessTarget): string {
  const dirEnd = target.featurePath.lastIndexOf('/');
  const featureDir = dirEnd === -1 ? target.featurePath : target.featurePath.slice(0, dirEnd);
  return command
    .replaceAll('{feature_path}', target.featurePath)
    .replaceAll('{feature_dir}', featureDir)
    .replaceAll('{feature_name}', target.capability);
}

interface CacheEntry {
  success: boolean;
  /** First ERROR message (≤200 chars) so a cached failure points at the cause. */
  failureSummary: string | null;
}

const OUTPUT_TAIL = 200;

/**
 * Trigger matrix (r13): --no-check skips silently; a nested invocation skips
 * with a per-spec INFO; an explicit --check without a configured run_command
 * yields a single INFO on the first spec; otherwise every expanded command
 * executes at most once (cache keyed by the expanded string).
 */
export function runHarnessForSpecs(
  targets: readonly HarnessTarget[],
  gate: HarnessGate,
): HarnessRunOutcome {
  const issuesByCapability = new Map<string, ValidationItem[]>();
  if (gate.check === 'off') return { issuesByCapability, executed: false };
  if (gate.nested) {
    for (const target of targets) {
      issuesByCapability.set(target.capability, [
        {
          level: 'INFO',
          id: target.featurePath,
          message: 'bdd harness skipped: nested invocation',
        },
      ]);
    }
    return { issuesByCapability, executed: false };
  }
  if (gate.runner === undefined || gate.runCommand === null || gate.runCommand === '') {
    if (gate.check === 'on' && targets.length > 0) {
      const first = targets[0] as HarnessTarget;
      issuesByCapability.set(first.capability, [
        {
          level: 'INFO',
          id: first.featurePath,
          message: '--check has no effect: bdd.run_command is not configured',
        },
      ]);
    }
    return { issuesByCapability, executed: false };
  }
  const cache = new Map<string, CacheEntry>();
  let executed = false;
  let announced = false;
  for (const target of targets) {
    const expanded = expandRunCommand(gate.runCommand, target);
    const cached = cache.get(expanded);
    let issues: ValidationItem[];
    if (cached !== undefined) {
      issues = cached.success
        ? [
            {
              level: 'INFO',
              id: target.featurePath,
              message: `bdd harness passed (cached): ${expanded}`,
            },
          ]
        : [
            {
              level: 'ERROR',
              id: target.featurePath,
              message: `bdd harness failed (cached result of ${expanded}): ${cached.failureSummary}`,
            },
          ];
    } else {
      if (!announced) {
        gate.onBeforeFirstRun?.(expanded);
        announced = true;
      }
      executed = true;
      const result = gate.runner.run(expanded, gate.cwd);
      const firstError =
        result.spawnError !== undefined
          ? `bdd harness could not start: ${expanded}: ${result.spawnError}`
          : result.exitCode === 0
            ? null
            : `bdd harness failed (exit ${result.exitCode}): ${expanded}: ${result.output.slice(-OUTPUT_TAIL)}`;
      issues =
        firstError === null
          ? [{ level: 'INFO', id: target.featurePath, message: `bdd harness passed: ${expanded}` }]
          : [{ level: 'ERROR', id: target.featurePath, message: firstError }];
      cache.set(expanded, {
        success: firstError === null,
        failureSummary: firstError === null ? null : firstError.slice(0, OUTPUT_TAIL),
      });
    }
    issuesByCapability.set(target.capability, issues);
  }
  return { issuesByCapability, executed };
}
