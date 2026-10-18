/**
 * Per-version migration registry (project migrate, migrate-prompt-per-version):
 * each release declares its own migration items, and a range query `(from, to]`
 * aggregates every registered version in between. Prompt bodies are English
 * per the house language convention (CLI output language) and are meant to be
 * handed to any agent verbatim — steps are executable commands, checks are
 * user-verifiable assertions. Pure: no IO, no clock.
 */
import { compareSemver as compareVersions } from '../util/semver.ts';

export { compareVersions };

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
  {
    version: '0.10.0',
    items: [
      {
        title:
          'Templates go zh-Hans single-track: the `en` tree is gone and unknown locales normalize to `zh-Hans`',
        steps: [
          'Optionally pin `locale: zh-Hans` in `llmanspec/config.yaml` — `en` and any unknown value now render Chinese.',
          'Run `llman-sdd init --update` and commit the refreshed managed AGENTS blocks and `.agents/skills/**`.',
          'Re-run `llman-sdd spec skeleton <name>` where a skeleton dialect matters — it now emits `# language: zh-CN`.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          'No English-rendered managed block or skill remains after `init --update`.',
          '`llman-sdd spec skeleton <name>` emits `# language: zh-CN`.',
          'A missing template resource makes `init` fail instead of silently skipping.',
        ],
      },
      {
        title:
          'Close-out gate tightened: a change whose contract is unchanged can no longer be closed out',
        steps: [
          'For a change that touches the contract, land and commit your `llmanspec/specs/**` edits on the bound branch before closing out.',
          'Set `needs_specs_change: false` in `proposal.md` frontmatter only when the change genuinely needs no contract edit.',
          'Keep `tasks.md` fully checked whenever the file exists.',
          'Run `llman-sdd change finalize <id>` (or `archive`) — the gate runs before any merge and writes nothing on failure.',
        ],
        checks: [
          '`llman-sdd change finalize <id>` on a spec-unlanded change fails with zero writes.',
          'A change that landed its specs, or declared `needs_specs_change: false`, still closes out cleanly.',
        ],
      },
      {
        title:
          'Usage errors now exit 2 (bare parent groups, missing arguments, invalid enum values)',
        steps: [
          'Update scripts that keyed on exit code 1 for missing arguments or invalid enum values — those now exit 2.',
          'Expect bare invocation of the five pure parent groups (`change`, `spec`, `project`, `archive`, `index`) to print a usage error and exit 2; `config` keeps its overview action.',
          'Root bare invocation (`llman-sdd`) still exits 0, but help now goes to stdout.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          '`llman-sdd change` exits 2 and `llman-sdd` exits 0 with help on stdout.',
          '`llman-sdd list --sort bogus` exits 2 (previously 1); domain errors still exit 1.',
        ],
      },
      {
        title:
          'Read-only commands resolve the nearest instance root (`--directory` on every command)',
        steps: [
          'Note that `list`, `show`, `graph`, `review`, `config`, `index` and `context` now start from `--directory <path>` (default cwd) and walk up to the nearest instance root.',
          'Re-check scripts that invoked read-only commands from a subdirectory — they no longer return empty results or leak `ENOENT`.',
          'Use `--directory <path>` on any command to pin the root explicitly.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          'From a subdirectory, `llman-sdd list` and `llman-sdd config` match the repo-root output.',
          'With no instance root above, the error is `no llmanspec root at or above <path>` (never `ENOENT`).',
          'A single-root repo keeps byte-identical output.',
        ],
      },
      {
        title:
          '`--backend` normalization: empty values, case and the `page-index` alias are accepted',
        steps: [
          'No action required — an empty `--backend`, an empty `LLMAN_SDD_INDEX_BACKEND`, `PAGEINDEX`, `page-index` and padded values now all select the pageindex backend.',
          'Keep using `index rebuild --backend` / `context --backend` unchanged.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          '`llman-sdd index rebuild --backend page-index` and an empty `--backend` succeed (previously exit 1).',
          'A legacy `rag/` directory never satisfies pageindex freshness.',
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
