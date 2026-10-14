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
    'specs.check_command',
    'not a pass|不是通过',
    // opt-in harness 语义 + 验证阶梯(r70,2026-10 validate-harness-opt-in)
    'verification ladder|验证阶梯',
    'validate --check|validate --check',
  ],
  'skills/llman-sdd-verify.md': [
    'real harness|真实 harness',
    'Rerun the gates yourself|亲自复跑门禁',
    'specs.check_command',
    'not a pass|不是通过',
    'measured on the change branch|在 change 分支上测量',
    // opt-in harness 证据必须显式 --check(r70,2026-10 validate-harness-opt-in)
    '--check --strict|--check --strict',
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

// 模板强度词边界(init-generators r97):同一语言内强度词汇表唯一,跨语言不互译。
// zh-Hans 正文只用 必须/不得/宜/不宜/可/不必/能/不能;en 正文用 RFC 2119 五级(STRENGTH_WORDS_EN)。
// 例外:引用 spec 合约原文的语句(被引对象词汇)——白名单按行匹配,须含 MUST/SHALL 且为引用语境。
/** en 正文合法强度词(RFC 2119);zh 四级表内词形由 ZH_STRENGTH_VERBS 反查表外词,常量作文档锚。 */
const STRENGTH_WORDS_ZH = /必须|不得|不宜|不必/u;
const STRENGTH_WORDS_EN = /\bMUST(?:\s+NOT)?\b|\bSHALL\b|\bSHOULD(?:\s+NOT)?\b|\bMAY\b/u;
void STRENGTH_WORDS_ZH;
void STRENGTH_WORDS_EN;
/** zh 模板允许出现 MUST/SHALL 的引用语境(行级白名单,新例外随 change 登记并附理由)。 */
const ZH_MUST_QUOTE_ALLOWLIST: readonly RegExp[] = [
  /不强制 MUST\/SHALL/, // feature-contract:描述 spec 自由文本约定(谈论情态词本身)
];
// 「应用/对应/响应」等复合词中的单字应不算强度词:排除前字 用/对/响/反 与后接的常用复合
const ZH_STRENGTH_VERBS =
  // 整词优先:不要求先于不要,防“不要求”被子串误读为表外词「不要」(r97 消歧)。
  /(?<![A-Za-z用对响反])应(?!用|答|急)|应当|应该|务必|一定要|不应|不要求|不要|禁止|严禁|切勿|尽量|最好/u;
const EN_ZH_LEAK = /必须|不得|不宜|不必/u;

test('template strength-word vocabulary is per-locale and single-table (r97)', () => {
  const violations: string[] = [];
  for (const locale of LOCALES) {
    for (const rel of collectAllTemplateRels()) {
      const text = readFileSync(templatePath(locale, rel), 'utf8');
      for (const rawLine of text.split('\n')) {
        const line = rawLine.replaceAll(/`[^`]*`/gu, ''); // strip inline code: spec quotes live there
        if (locale === 'zh-Hans') {
          if (/MUST|SHALL/u.test(line)) {
            const allowed = ZH_MUST_QUOTE_ALLOWLIST.some((re) => re.test(line));
            if (!allowed)
              violations.push(
                `[zh-Hans/${rel}] 裸 MUST/SHALL(改 必须/不得,或入引用白名单): ${line.trim().slice(0, 60)}`,
              );
          }
          const m = line.match(ZH_STRENGTH_VERBS);
          if (m)
            violations.push(
              `[zh-Hans/${rel}] 四级表外强度词「${m[0]}」: ${line.trim().slice(0, 60)}`,
            );
        } else if (EN_ZH_LEAK.test(line)) {
          violations.push(
            `[en/${rel}] 中文强度词泄漏(改 MUST/MUST NOT): ${line.trim().slice(0, 60)}`,
          );
        }
      }
    }
  }
  expect(violations).toEqual([]);
});

/** All template md relpaths across locales (shared with the everyFile walk). */
function collectAllTemplateRels(): string[] {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (entry.endsWith('.md')) out.push(full);
    }
    return out;
  };
  return walk(join(TEMPLATES_DIR, 'zh-Hans')).map((p) =>
    p.slice(join(TEMPLATES_DIR, 'zh-Hans').length + 1),
  );
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
