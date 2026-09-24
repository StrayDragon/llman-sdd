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
    reason: '`--skip-specs` was removed (D1): templates must not mention the deleted flag at all',
  },
  // D2 残留对账:已移除命令/旗标/修饰符在模板中零提及(不留「已移除」陈述)
  {
    pattern:
      /\bcheckpoint\b|change delta|feature_delta|solidify|\.delta\.toon|project import|\bdeltaCount\b|\bno-interactive\b/u,
    reason:
      'deleted surface (D1): templates must not name `change checkpoint` / delta toolchain / `--no-interactive` / `deltaCount` — removed command and flag surface has no stub, and guidance must not narrate the removal',
  },
  {
    pattern: /tasks\[\]\.test/u,
    reason: 'no JSON surface exposes `tasks[].test`; guidance must read the task text instead',
  },
  // readyToImplement semantics: it aggregates ALL gateChecks (incl. tasks-done),
  // so it is a completion signal gating verify/finalize — never the apply ENTRY
  // gate (that is stage=full ∧ specs-landed gate green). Wording that makes it
  // an entry precondition describes an unreachable state.
  {
    pattern:
      /Enter apply only when|进入 apply 前须 `readyToImplement|apply 前须 `readyToImplement=true`|仅当 `readyToImplement=true` 时用|仅当 `readyToImplement=true` 才进入 apply/u,
    reason:
      'readyToImplement=true is unreachable before implementation (tasks-done gates it) — apply entry must key on the specs-landed gate, not readyToImplement',
  },
  {
    pattern: /requires `readyToImplement`\)|（须 `readyToImplement`）|（须 readyToImplement）/u,
    reason:
      'pipeline pointers must not label apply as "requires readyToImplement"; use "after Specs landing"',
  },
  {
    pattern:
      /\(until `readyToImplement=true`\)|\(through `readyToImplement=true`\)|（直到 `readyToImplement=true`）|（至 `readyToImplement=true`）/u,
    reason: 'propose/ff end at the specs-landed gate, not at readyToImplement=true',
  },
  {
    pattern: /Implement \(readyToImplement\)|实施（须 readyToImplement）/u,
    reason: 'apply node label must key on specs-landed, not readyToImplement',
  },
  {
    pattern: /implement\/archive without `readyToImplement`|未 `readyToImplement` 就实施\/归档/u,
    reason:
      'ethics: implementing is gated by Branch binding + specs-landed gate; only archiving requires readyToImplement=true',
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
    'specs-landed gate|specs-landed 门',
    'completion signal|完成信号',
    // D9: 写 tasks.md 只列实现与验证任务,收口是流水线步骤
    'close-out|收口',
    'pipeline step|流水线步骤',
    // 前后对比类完成判据注明测量位置
    'measured on the change branch|在 change 分支上测量',
  ],
  'skills/llman-sdd-apply.md': [
    'LLMAN_SDD_INDEX_CHAT_MODEL',
    'specs-landed gate|specs-landed 门',
    'completion signal|完成信号',
    // D9: 勾选节明确收口不是 task
    'close-out is not a task|收口不是 task',
    // 门禁证据:真实 harness / 编辑与验证串行 / 基线测量位置 / 用例数不减
    'real harness|真实 harness',
    'parallel tool-call batch|同一批并行工具调用',
    'measured on the change branch|在 change 分支上测量',
    'test count|用例数',
  ],
  'skills/llman-sdd-verify.md': [
    'real harness|真实 harness',
    'Rerun the gates yourself|亲自复跑门禁',
    'measured on the change branch|在 change 分支上测量',
  ],
  'skills/llman-sdd-quick.md': ['LLMAN_SDD_INDEX_CHAT_MODEL'],
  // manual-trigger-only skills back the claim with the frontmatter key
  'skills/llman-sdd-apply-cycle.md': [
    'disable-model-invocation: true',
    'specs-landed gate|specs-landed 门',
    'completion signal|完成信号',
  ],
  'skills/llman-sdd-wayfinder.md': ['disable-model-invocation: true'],
  'skills/llman-sdd-specs-compact.md': ['project dedupe-req-ids'],
  // entry-vs-completion semantics of readyToImplement lives in the shared units
  'units/skills/stage-guard.md': [
    'specs-landed gate|specs-landed 门',
    'completion signal|完成信号',
  ],
  'units/skills/git-native-flow.md': [
    'specs-landed gate|specs-landed 门',
    'completion signal|完成信号',
  ],
  'units/skills/git-native-flow-brief.md': [
    'specs-landed gate|specs-landed 门',
    'completion signal|完成信号',
  ],
  'units/skills/validation-hints.md': [
    'specs-landed gate|specs-landed 门',
    'completion signal|完成信号',
  ],
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
      const lower = readFileSync(templatePath(locale, rel), 'utf8').toLowerCase();
      checked.add(`${locale}/${rel}`);
      for (const marker of markers) {
        // "a|b" = any-of alternates (locale-specific terms, same semantics)
        const alts = marker.split('|');
        if (!alts.some((alt) => lower.includes(alt.toLowerCase())))
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
