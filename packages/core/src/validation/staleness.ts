/**
 * Staleness evaluator (validation/staleness parity): predecessor `sdd/spec/staleness.rs`
 * observable contract — status/baseRef/scope/touchedPaths/specUpdated/dirty/
 * notes plus per-capability staleness issues. Pure: git + env are injected.
 */

import type { GitLike } from '../git/spawnGit.ts';

export type StalenessStatus = 'OK' | 'INFO' | 'WARN' | 'STALE' | 'NOTAPPLICABLE';

export interface StalenessInfo {
  status: StalenessStatus;
  baseRef: string | null;
  scope: string[];
  touchedPaths: string[];
  specUpdated: boolean;
  dirty: boolean;
  notes: string[];
}

export interface StalenessIssue {
  level: 'ERROR' | 'WARNING' | 'INFO';
  path: string;
  message: string;
}

export interface StalenessDeps {
  git: GitLike;
  root: string;
  /** spec file path relative to root, e.g. `llmanspec/specs/auth.feature` */
  specRel: string;
  /** scope entries from the `# scope:` header (raw, unnormalized) */
  scope: string[];
  /**
   * `# reviewed-through: <id>` header value (re-review stamp governance): when
   * set, a STALE verdict is suppressed iff every scope-touching commit on the
   * branch mentions that change id — the recorded no-behavior-change review.
   */
  reviewedThrough?: string | null;
  /** env override for LLMANSPEC_BASE_REF */
  baseRefEnv?: string;
  defaultBranchName?: string;
}

const normalizePath = (value: string): string =>
  value.trim().replace(/^\.\//u, '').replace(/^\/+/u, '').replace(/\/+$/u, '');

const scopeMatches = (path: string, scope: readonly string[]): boolean => {
  const p = normalizePath(path);
  return scope.some((s) => p === s || p.startsWith(`${s}/`));
};

export function notApplicableStaleness(): StalenessInfo {
  return {
    status: 'NOTAPPLICABLE',
    baseRef: null,
    scope: [],
    touchedPaths: [],
    specUpdated: false,
    dirty: false,
    notes: [],
  };
}

const DIRTY_MSG = 'Working tree is dirty; results may be unreliable.';
const SCOPE_MISSING_MSG = 'Note: Spec validation scope is missing.';
const BASE_MISSING_MSG =
  "Note: Unable to resolve base ref for staleness check. Set LLMANSPEC_BASE_REF (e.g. 'main' or 'origin/main'), or upgrade llman if below 0.0.60.";

/**
 * Evaluate staleness for one capability spec — predecessor status semantics.
 * Returns the info object plus warning/info issues (strict escalation is the
 * caller's job, matching predecessor `apply_strict`).
 */
export function evaluateStaleness(deps: StalenessDeps): {
  info: StalenessInfo;
  issues: StalenessIssue[];
} {
  const { git, specRel, scope, baseRefEnv } = deps;
  const issues: StalenessIssue[] = [];
  const notes: string[] = [];
  const normScope = scope.map(normalizePath).filter((s) => s !== '');

  const rawBaseRef =
    baseRefEnv !== undefined && baseRefEnv.trim() !== '' ? baseRefEnv.trim() : null;
  let baseRef: string | null = null;
  let mergeBase: string | null = null;

  if (rawBaseRef !== null) {
    baseRef = rawBaseRef;
    mergeBase = revParse(git, rawBaseRef);
  } else {
    const defaultBranchName = deps.defaultBranchName ?? defaultBranchNameFn(git);
    mergeBase = git.runOpt(['merge-base', defaultBranchName, 'HEAD']);
    if (mergeBase !== null) baseRef = mergeBase;
  }

  let status: StalenessStatus = 'OK';
  if (normScope.length === 0) {
    status = 'WARN';
    notes.push(SCOPE_MISSING_MSG);
    issues.push({ level: 'WARNING', path: `${specId()}/staleness`, message: SCOPE_MISSING_MSG });
  }
  if (mergeBase === null && rawBaseRef === null) {
    status = 'WARN';
    notes.push(BASE_MISSING_MSG);
    issues.push({ level: 'WARNING', path: `${specId()}/staleness`, message: BASE_MISSING_MSG });
  }

  let touchedPaths: string[] = [];
  let specUpdated = false;
  if (status !== 'WARN' && baseRef !== null && mergeBase !== null) {
    const diff = git.runOpt(['diff', '--name-only', `${baseRef}...HEAD`]) ?? '';
    const paths =
      diff === ''
        ? []
        : diff
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l !== '');
    if (paths.length > 0) {
      specUpdated = paths.some((p) => normalizePath(p) === normalizePath(specRel));
      touchedPaths = paths.filter((p) => scopeMatches(p, normScope));
    }
    const reviewAcked =
      touchedPaths.length > 0 &&
      !specUpdated &&
      reviewCoversBranch(deps.reviewedThrough ?? null, git, baseRef);
    if (touchedPaths.length > 0 && !specUpdated && !reviewAcked) {
      status = 'STALE' as StalenessStatus;
      issues.push({ level: 'WARNING', path: `${specId()}/staleness`, message: STALE_MSG });
    } else if (reviewAcked) {
      // confirm-style ack: scope touched, spec untouched, reviewed-through
      // covers the branch — downgrade to OK with an explanatory note.
      status = 'OK';
      notes.push(reviewAckedMsg(deps.reviewedThrough ?? ''));
    } else if (specUpdated && touchedPaths.length === 0) {
      status = 'INFO';
      notes.push(SPEC_UPDATED_MSG);
    }
  }

  // Tolerant: outside a git repo (or on git failure) treat as dirty (predecessor unwrap_or(true)).
  const dirty = (git.runOpt(['status', '--porcelain']) ?? 'dirty') !== '';
  if (dirty) {
    if (status === 'OK' || status === 'STALE') status = 'INFO';
    notes.push(DIRTY_MSG);
    issues.push({ level: 'INFO', path: `${specId()}/staleness`, message: DIRTY_MSG });
  }

  return {
    info: { status, baseRef, scope: normScope, touchedPaths, specUpdated, dirty, notes },
    issues,
  };

  function specId(): string {
    return deps.specRel.replace(/^llmanspec\/specs\//u, '').replace(/\.feature$/u, '');
  }
}

const STALE_MSG =
  "Note: Code in this spec's scope changed on this branch but the spec was not updated; re-review the spec.";
const SPEC_UPDATED_MSG = 'Note: Spec updated on this branch.';

const reviewAckedMsg = (id: string): string =>
  `Note: Scope changed on this branch; covered by the recorded review (reviewed-through: ${id}).`;

/**
 * Re-review ack check: every scope-touching commit message on
 * `baseRef..HEAD` references the reviewed-through change id. Empty id or git
 * failure → not covered (falls back to the plain STALE verdict). A commit
 * referencing several changes satisfies any of them (`c2858`-style tokens).
 */
function reviewCoversBranch(
  reviewedThrough: string | null,
  git: GitLike,
  baseRef: string,
): boolean {
  if (reviewedThrough === null || reviewedThrough.trim() === '') return false;
  const id = reviewedThrough.trim();
  const log = git.runOpt(['log', '--format=%s', `${baseRef}..HEAD`]);
  if (log === null || log === '') return false;
  return log
    .split('\n')
    .filter((l) => scopeLineRelevant(l))
    .every((l) => l.includes(id));
}

/** Lines without any `c<num>` token carry no change attribution — skip them. */
function scopeLineRelevant(line: string): boolean {
  return /c\d+/u.test(line) || line.trim() === '';
}

function revParse(git: GitLike, ref: string): string | null {
  return git.runOpt(['rev-parse', '--verify', '--quiet', ref]) ?? null;
}

// Deliberately NOT shared with defaultBranch() in git/spawnGit.ts — this
// predecessor staleness probe is local-only (main → master, 'main' fallback, no origin
// consultation). Do not merge the two.
function defaultBranchNameFn(git: GitLike): string {
  if (git.runOpt(['show-ref', '--verify', '--quiet', 'refs/heads/main']) !== null) return 'main';
  if (git.runOpt(['show-ref', '--verify', '--quiet', 'refs/heads/master']) !== null)
    return 'master';
  return 'main';
}
