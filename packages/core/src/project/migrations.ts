/**
 * Versioned migration registry (project migrate, drop-review-stamp-and-scope
 * follow-up): one entry per supported upgrade path. Prompt bodies are English
 * per the house language convention (CLI output language) and are meant to be
 * handed to any agent verbatim — steps are executable commands, checks are
 * user-verifiable assertions. Pure: no IO, no clock.
 */

export interface MigrationEntry {
  /** Registry key, shape `<from>-><to>` (exact-match lookup). */
  id: string;
  title: string;
  /** Agent-executable commands, in order. */
  steps: readonly string[];
  /** Post-conditions the user (or the agent) can verify. */
  checks: readonly string[];
}

export const MIGRATIONS: readonly MigrationEntry[] = [
  {
    id: '0.7.5->0.8.0',
    title: 'Governance metadata retirement (`# reviewed-through:` stamp & `# scope:` header)',
    steps: [
      'Run `llman-sdd project migrate strip-legacy-headers --dry-run` to preview the affected spec files.',
      'Run `llman-sdd project migrate strip-legacy-headers` to strip the legacy `# scope:` / `# reviewed-through:` header comment lines (idempotent).',
      'Run `llman-sdd init --update` to refresh the managed AGENTS blocks and agent skills.',
      'Run `llman-sdd validate --all --strict` — it must pass.',
    ],
    checks: [
      'No `# scope:` / `# reviewed-through:` header lines remain under `llmanspec/specs/**`.',
      '`llman-sdd review` signal kinds are exactly unbound / locked / validate (no `stale`).',
      '`llman-sdd validate --specs --json` output carries no `staleness` key.',
      'A subsequent `llman-sdd` invocation prints no version-drift NOTE.',
    ],
  },
];

const EXPR_RE = /^\d+\.\d+\.\d+->\d+\.\d+\.\d+$/u;

/** Exact-match lookup; null when the expr is well-formed but unknown. */
export function findMigration(expr: string): MigrationEntry | null {
  return MIGRATIONS.find((m) => m.id === expr) ?? null;
}

export function knownMigrationIds(): string[] {
  return MIGRATIONS.map((m) => m.id);
}

export function isValidMigrationExpr(expr: string): boolean {
  return EXPR_RE.test(expr);
}

/** Agent-facing playbook for one migration — deterministic, English. */
export function migrationPrompt(entry: MigrationEntry): string {
  const steps = entry.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const checks = entry.checks.map((c) => `- [ ] ${c}`).join('\n');
  return [
    `# Migration playbook: ${entry.id}`,
    '',
    `${entry.title}.`,
    '',
    '## Steps',
    '',
    steps,
    '',
    '## Verification checklist',
    '',
    checks,
    '',
  ].join('\n');
}

/** Lines appended to the bare `project migrate` overview. */
export function migrationOverviewLines(): string[] {
  const ids = knownMigrationIds()
    .map((id) => `  - ${id}`)
    .join('\n');
  return [
    '',
    'Versioned migration playbooks (agent-readable, via `project migrate prompt`):',
    ids,
    "Usage: llman-sdd project migrate prompt --version-expr '<from>-><to>'",
    'Mechanical spec-header strip: llman-sdd project migrate strip-legacy-headers [--dry-run]',
  ];
}
