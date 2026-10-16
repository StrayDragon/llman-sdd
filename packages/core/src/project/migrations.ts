/**
 * Per-version migration registry (project migrate, migrate-prompt-per-version):
 * each release declares its own migration items, and a range query `(from, to]`
 * aggregates every registered version in between. Prompt bodies are English
 * per the house language convention (CLI output language) and are meant to be
 * handed to any agent verbatim — steps are executable commands, checks are
 * user-verifiable assertions. Pure: no IO, no clock.
 */

export interface MigrationItem {
  title: string;
  /** Agent-executable commands, in order. */
  steps: readonly string[];
  /** Post-conditions the user (or the agent) can verify. */
  checks: readonly string[];
}

export interface MigrationDoc {
  /** Release version this migration set belongs to, `x.y.z`. */
  version: string;
  items: readonly MigrationItem[];
}

export const MIGRATIONS: readonly MigrationDoc[] = [
  {
    version: '0.8.0',
    items: [
      {
        title: 'Governance metadata retirement (`# reviewed-through:` stamp & `# scope:` header)',
        steps: [
          'Run `llman-sdd project migrate strip-legacy-headers --dry-run` to preview the affected spec files.',
          'Run `llman-sdd project migrate strip-legacy-headers` to strip legacy `# scope:` / `# reviewed-through:` / `# capability:` header comment lines (idempotent).',
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
    ],
  },
  {
    version: '0.9.0',
    items: [
      {
        title: 'Retire `# capability:` header; assign spec ids from paths (r101)',
        steps: [
          'Run `llman-sdd project migrate strip-legacy-headers --dry-run` to preview spec header strips.',
          'Run `llman-sdd project migrate strip-legacy-headers` to remove `# capability:` (and any remaining `# scope:` / `# reviewed-through:`) lines.',
          'Ensure each `功能:` / `Feature:` title equals the assigned spec id (`llman-sdd list --specs` for ids).',
          'Run `llman-sdd init --update` to refresh managed skills and feature-contract guidance.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          'No `# capability:` lines remain under `llmanspec/specs/**`.',
          'Each spec file `功能:` title matches `llman-sdd show <spec-id>` id.',
          '`llman-sdd list --specs` reports stable ids for flat and directory layouts.',
        ],
      },
      {
        title: '`specs.check_transitions` removed — transition validation is tag-scoped',
        steps: [
          'Delete `specs.check_transitions` from `llmanspec/config.yaml` (any leftover value is stripped at load with a WARNING).',
          'Tag example tables that merely look like transition tables with `@no-transitions` on the scenario outline.',
          'Tag real transition tables whose column names miss the sniff aliases with `@transitions` to force validation.',
          'Run `llman-sdd spec transitions` for the authoritative aliases, tags and E1–E4 gates.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          '`llmanspec/config.yaml` carries no `specs.check_transitions` key and loading prints no strip WARNING.',
          'Untagged example tables hitting at least two of the from/event/to alias families pass E1–E4.',
        ],
      },
      {
        title: 'init locale precedence chain and per-workspace `--update` sweep',
        steps: [
          'Add an explicit `locale:` key to `llmanspec/config.yaml` (e.g. `locale: zh-Hans`) to pin the rendering language and silence the missing-key WARNING.',
          'Run `llman-sdd init --update` from any instance root — it refreshes managed blocks of every discovered root in the workspace (skills stay repo-root only).',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          '`llmanspec/config.yaml` carries an explicit `locale:` key; `init --update` prints no locale WARNING.',
          'Managed AGENTS.md blocks render in the configured locale across every workspace instance.',
        ],
      },
    ],
  },
];

const VERSION_RE = /^\d+\.\d+\.\d+$/u;
const EXPR_RE = /^\d+\.\d+\.\d+->\d+\.\d+\.\d+$/u;

export function isValidVersion(version: string): boolean {
  return VERSION_RE.test(version);
}

/** Numeric `x.y.z` comparison; negative when a < b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const [aMajor, aMinor, aPatch] = a.split('.').map(Number) as [number, number, number];
  const [bMajor, bMinor, bPatch] = b.split('.').map(Number) as [number, number, number];
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}

/** Versions `(from, to]` that carry registered migrations, ascending. */
export function resolveMigrations(from: string, to: string): MigrationDoc[] {
  return MIGRATIONS.filter(
    (d) => compareVersions(d.version, from) > 0 && compareVersions(d.version, to) <= 0,
  ).toSorted((a, b) => compareVersions(a.version, b.version));
}

/** Parse a deprecated `'<from>-><to>'` expression; null when malformed. */
export function parseVersionExpr(expr: string): { from: string; to: string } | null {
  if (!EXPR_RE.test(expr)) return null;
  const [from, to] = expr.split('->') as [string, string];
  return { from, to };
}

export function knownMigrationVersions(): string[] {
  return MIGRATIONS.map((d) => d.version);
}

/** Agent-facing playbook for a range — deterministic, English. */
export function migrationPrompt(from: string, to: string): string {
  const docs = resolveMigrations(from, to);
  if (docs.length === 0) {
    return `No documented migrations for ${from} -> ${to}.\n`;
  }
  const sections = docs.map((doc) => {
    const items = doc.items.map((item) => {
      const steps = item.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
      const checks = item.checks.map((c) => `- [ ] ${c}`).join('\n');
      return [
        `### ${item.title}`,
        '',
        '#### Steps',
        '',
        steps,
        '',
        '#### Verification checklist',
        '',
        checks,
        '',
      ].join('\n');
    });
    return [`## ${doc.version}`, '', items.join('\n')].join('\n');
  });
  return [`# Migration playbook: ${from} -> ${to}`, '', sections.join('\n---\n\n'), ''].join('\n');
}

/** Lines appended to the bare `project migrate` overview. */
export function migrationOverviewLines(): string[] {
  const versions = knownMigrationVersions()
    .map((v) => `  - ${v}`)
    .join('\n');
  return [
    '',
    'Versioned migration playbooks (agent-readable, via `project migrate prompt`):',
    versions,
    'Usage: llman-sdd project migrate prompt --from-version <from> --to-version <to>',
    'Mechanical spec-header strip: llman-sdd project migrate strip-legacy-headers [--dry-run]',
  ];
}
