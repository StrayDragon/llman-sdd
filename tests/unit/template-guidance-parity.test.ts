import { expect, test } from 'bun:test';
// Template guidance-semantic parity gate (init-generators r70).
//
// The command-parity gate (template-command-parity.test.ts, r67) proves that
// referenced command paths exist and flags are registered. It cannot catch
// semantic drift: a flag whose VALUE DOMAIN is wrong (`review --capability`
// takes a spec id, not a change id), a recommended flag that is a no-op
// (`--skip-specs`), dead JSON fields (`tasks[].test`), or behavior claims
// that contradict the implementation (`change archive` also auto-commits).
// This gate pins the corrected guidance as forbidden patterns + required
// markers over the template SOURCES (both locales); rendered products and
// golden baselines are downstream — the source being clean implies they are.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const TEMPLATES_DIR = join(REPO_ROOT, 'packages', 'core', 'templates');
const LOCALES = ['en', 'zh-Hans'] as const;

type Locale = (typeof LOCALES)[number];

/** Patterns that must NOT appear in ANY template markdown file. */
const FORBIDDEN_EVERYWHERE: readonly { pattern: RegExp; reason: string }[] = [
  {
    pattern: /review --capability/u,
    reason:
      '`--capability` takes a spec id; the human-review checkpoint must call plain `llman-sdd review` (a change id here exits 1 and reads as CRITICAL)',
  },
  {
    pattern: /--skip-specs/u,
    reason:
      '`--skip-specs` is a v1-compat no-op — templates must not recommend it as a behavior mode',
  },
  {
    pattern: /tasks\[\]\.test/u,
    reason: 'no JSON surface exposes `tasks[].test`; guidance must read the task text instead',
  },
];

/** Patterns that must NOT appear in a specific template file (both locales). */
const FORBIDDEN_PER_FILE: Readonly<Record<string, readonly { pattern: RegExp; reason: string }[]>> =
  {
    'skills/llman-sdd-archive.md': [
      {
        pattern: /no auto commit|无自动提交/u,
        reason:
          '`change archive` shares the finalize close-out commit; "no auto commit" misstates the implementation',
      },
    ],
    'units/skills/stage-guard.md': [
      {
        pattern:
          /proposal\+design\+tasks exist but stage is still|若已有 proposal\+design\+tasks 仍是/u,
        reason:
          'impossible state: with design.md present the stage is at least `designed`; the draft case is tasks-without-design',
      },
    ],
  };

/** Markers that MUST appear in a specific template file (both locales). */
const REQUIRED_PER_FILE: Readonly<Record<string, readonly string[]>> = {
  'skills/llman-sdd-explore.md': ['LLMAN_SDD_INDEX_CHAT_MODEL'],
  'skills/llman-sdd-propose.md': [
    'LLMAN_SDD_INDEX_CHAT_MODEL',
    'spec next-req-id',
    'spec add-req',
    'spec add-scenario',
    'spec skeleton',
    'spec resolve-req',
  ],
  'skills/llman-sdd-apply.md': ['LLMAN_SDD_INDEX_CHAT_MODEL'],
  'skills/llman-sdd-quick.md': ['LLMAN_SDD_INDEX_CHAT_MODEL'],
  // manual-trigger-only skills back the claim with the frontmatter key
  'skills/llman-sdd-apply-cycle.md': ['disable-model-invocation: true'],
  'skills/llman-sdd-wayfinder.md': ['disable-model-invocation: true'],
  'skills/llman-sdd-specs-compact.md': ['project dedupe-req-ids'],
};

function templatePath(locale: Locale, rel: string): string {
  return join(TEMPLATES_DIR, locale, rel);
}

test('template guidance semantics match CLI value domains and behavior (r70)', () => {
  const violations: string[] = [];
  const checked = new Set<string>();

  for (const locale of LOCALES) {
    for (const [rel, rules] of Object.entries(FORBIDDEN_PER_FILE)) {
      const text = readFileSync(templatePath(locale, rel), 'utf8');
      checked.add(`${locale}/${rel}`);
      for (const { pattern, reason } of rules) {
        if (pattern.test(text))
          violations.push(`[${locale}/${rel}] forbidden /${pattern.source}/ → ${reason}`);
      }
    }
    for (const [rel, markers] of Object.entries(REQUIRED_PER_FILE)) {
      const text = readFileSync(templatePath(locale, rel), 'utf8');
      checked.add(`${locale}/${rel}`);
      for (const marker of markers) {
        if (!text.includes(marker))
          violations.push(`[${locale}/${rel}] missing marker "${marker}"`);
      }
    }
  }

  // everyFile: walk all template markdown for the global forbidden patterns
  const collectMarkdown = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...collectMarkdown(full));
      else if (entry.endsWith('.md')) out.push(full);
    }
    return out;
  };
  const files = collectMarkdown(TEMPLATES_DIR).map((p) => p.slice(TEMPLATES_DIR.length + 1));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const text = readFileSync(join(TEMPLATES_DIR, file), 'utf8');
    for (const { pattern, reason } of FORBIDDEN_EVERYWHERE) {
      if (pattern.test(text))
        violations.push(`[${file}] forbidden /${pattern.source}/ → ${reason}`);
    }
  }

  expect(checked.size).toBeGreaterThan(0);
  expect(violations).toEqual([]);
});
