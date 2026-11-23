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
          'Delete leftover `# scope:`, `# reviewed-through:`, and `# capability:` header comment lines under `llmanspec/specs/**` by hand. The one-shot command was removed and has no alias.',
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
          'Delete leftover `# capability:` (and any remaining `# scope:` / `# reviewed-through:`) lines under `llmanspec/specs/**` by hand. The one-shot command was removed and has no alias.',
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
          'Re-run `llman-sdd spec new <name>` where a skeleton dialect matters — it now emits `# language: zh-CN`.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          'No English-rendered managed block or skill remains after `init --update`.',
          '`llman-sdd spec new <name>` emits `# language: zh-CN`.',
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
          'Run `llman-sdd change archive <id>` — the gate runs before any merge and writes nothing on failure.',
        ],
        checks: [
          '`llman-sdd change archive <id>` on a spec-unlanded change fails with zero writes.',
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
  {
    version: '0.11.0',
    items: [
      {
        title: 'Frozen cards normalized to single-document YAML (no `---` fences)',
        steps: [
          'Run `llman-sdd project migrate frozen-cards-unfence --dry-run` to preview the legacy fenced cards.',
          'Run `llman-sdd project migrate frozen-cards-unfence` to rewrite them as fence-free single-document YAML (idempotent).',
          'Drop any `check-yaml` exemption you added for `llmanspec/changes/archive/*.yaml` — stock pre-commit accepts the cards as-is.',
          'Run `llman-sdd validate --all --strict` — it must pass.',
        ],
        checks: [
          'No `llmanspec/changes/archive/<YYYY-MM-DD>-<id>.yaml` card opens with a bare `---` line.',
          'The stock `check-yaml` hook (no `--allow-multiple-documents`, no exclude) passes on the archive directory.',
          '`llman-sdd graph --scope archived` shows the same frozen nodes and dependency edges as before.',
        ],
      },
      {
        title: 'Index and context commands removed',
        steps: [
          'Stop calling `llman-sdd index` and `llman-sdd context`. Both are unknown commands and have no aliases.',
          'Unset `LLMAN_SDD_INDEX_BACKEND`, `LLMAN_SDD_INDEX_CHAT_MODEL`, `LLMAN_SDD_INDEX_CHAT_API_HOST`, `LLMAN_SDD_INDEX_CHAT_API_KEY`, `LLMAN_SDD_INDEX_OPENAI_API_HOST`, and `LLMAN_SDD_INDEX_OPENAI_API_KEY` if you exported them.',
          'Locate specs with `llman-sdd list --specs` and read the `.feature` files.',
          'Leave `llmanspec/.context/pageindex/` in place if you want; nothing reads it. Delete that directory yourself when you no longer need it.',
          'The version stamp moved to `llmanspec/.sdd-state.json`. An existing `llmanspec/.context/sdd-state.json` is still read until the next `llman-sdd init --update`, which writes only the new path and does not delete the old file.',
          'Run `llman-sdd init --update` so installed skills stop mentioning index and context.',
        ],
        checks: [
          '`llman-sdd index` and `llman-sdd context` exit 2 as unknown commands.',
          '`llmanspec/.sdd-state.json` exists after `init --update` and contains `cli_version`.',
          'If `llmanspec/.context/sdd-state.json` was present, it is still on disk after the update.',
        ],
      },
      {
        title: 'Command surface: one close-out, one bind, top-level cold backup',
        steps: [
          'Replace `llman-sdd change finalize` with `llman-sdd change archive`. There is no alias. Close-out now also requires a clean tree and refuses `--force`.',
          'Replace `llman-sdd archive freeze` with `llman-sdd freeze`, and `llman-sdd archive thaw` with `llman-sdd thaw`. Flags are unchanged.',
          'Replace `llman-sdd change attach` with `llman-sdd change start`. On the default branch it creates `sdd/<id>`; on another local branch it binds the current checkout. `--force` rebinds.',
          'Replace `llman-sdd spec skeleton` with `llman-sdd spec new`.',
          'Stop calling `spec migrate-native`, `project migrate strip-legacy-headers`, `project migrate --kind`, and `--version-expr`. Those commands and flags are gone and have no aliases. Keep `project migrate prompt` and `project migrate frozen-cards-unfence`.',
          'Run `llman-sdd init --update` so installed skills name the new commands.',
        ],
        checks: [
          '`llman-sdd change finalize`, `llman-sdd change attach`, `llman-sdd spec skeleton`, and `llman-sdd archive` exit 2 as unknown commands.',
          '`llman-sdd change archive --help` lists `--no-check`, `--no-commit`, and `--dry-run`, and does not list `--force`.',
          '`llman-sdd freeze --help` and `llman-sdd thaw --help` succeed.',
        ],
      },
      {
        title: 'Skill discovery no longer uses extra_skills or a root AGENTS.md block',
        steps: [
          'Remove `extra_skills` from `llmanspec/config.yaml` if present. Leftover keys are ignored.',
          'Run `llman-sdd init --update`. It writes every built-in `llman-sdd-*` skill, leaves unprefixed custom skills, and strips an existing `LLMANSPEC` marker block from the repository-root `AGENTS.md` while keeping text outside the markers. It does not create a root `AGENTS.md` when none exists. `llmanspec/AGENTS.md` stays managed.',
          'Run `llman-sdd init --check`. Installed `llman-sdd-*` skills must share this CLI major and minor. On mismatch, run `llman-sdd init --update` again.',
        ],
        checks: [
          '`llman-sdd init --check` exits 0.',
          'The repository-root `AGENTS.md` has no `LLMANSPEC` markers. `llmanspec/AGENTS.md` still has its managed block.',
        ],
      },
      {
        title: 'Binary build defines use the DEV_BUILD prefix',
        steps: [
          'If a custom build script defines `process.env.LLMAN_SDD_VERSION`, `process.env.LLMAN_SDD_EMBEDDED_TEMPLATES`, or `process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64`, rename those keys to `process.env.LLMAN_SDD_DEV_BUILD_VERSION`, `process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_TEMPLATES`, and `process.env.LLMAN_SDD_DEV_BUILD_EMBEDDED_7ZZ_WASM_B64`. The source literal must match the define key exactly.',
          'Leave `LLMAN_SDD_HARNESS_ACTIVE` unchanged. It is a runtime nested-run guard, not a compile define.',
        ],
        checks: [
          'A rebuilt binary reports this release from `llman-sdd --version`.',
          '`llman-sdd init` from that binary still renders skills, and `freeze` / `thaw` still round-trip.',
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
    'Legacy frozen-card unfence: llman-sdd project migrate frozen-cards-unfence [--dry-run]',
  ];
}
