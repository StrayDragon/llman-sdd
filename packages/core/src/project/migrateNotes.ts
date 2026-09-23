// Collaboration notes for `project migrate` — v1 (Rust ≤0.0.78) shipped two
// one-shot migrations (toon2features / specs-flatten); v2 deliberately ships
// none (peripheral-commands r35: the command outputs an explanation and never
// migrates). Porting the implementations was surveyed on 2026-09-23 and
// declined: specs-flatten fights v2's directory-style coexistence direction,
// and toon2features has no confirmed audience. Instead, `--kind <x>` prints
// the equivalent manual-migration guidance so old command forms get useful
// stdout instead of an unknown-option error.

export const MIGRATE_KINDS = ['toon2features', 'specs-flatten'] as const;

export type MigrateKind = (typeof MIGRATE_KINDS)[number];

export function isMigrateKind(value: string): value is MigrateKind {
  return (MIGRATE_KINDS as readonly string[]).includes(value);
}

const isZh = (locale: string): boolean => locale.trim().toLowerCase().startsWith('zh');

const TOON2FEATURES_ZH = `llman-sdd project migrate --kind toon2features — 遗留 spec.toon → 单轨 .feature 协作说明

背景:v1(Rust ≤0.0.78)以 specs/<cap>/spec.toon(表格形态)与散落 .feature 双轨存规格;v2 只读单轨 .feature(specs/<cap>.feature 或目录式 <cap>/<cap>.feature),spec.toon 会被静默忽略。本命令不执行迁移,以下为手工迁移指引。

Agent 该做什么:
1. 逐 capability 确认真的存在 spec.toon(无则跳过)。
2. 读 spec.toon 表格并转换:requirements 表每行 → 在 <cap>.feature 写一条 @req:<id> @human 规则场景(id 进 tag,statement 全文放描述,须含 MUST/SHALL);scenarios 表每行:有 GWT(假如/当/那么)且 req_id 已定义 → 写 @executable 验收场景并以 @req:<req_id> 挂回规则;无 GWT 或 req 未定义 → 在 proposal/design 记录理由后舍弃,不可静默丢弃。
3. 目标 <cap>.feature 已存在时勿覆盖——人工合并两侧内容后再删除 spec.toon。
4. 迁移后运行 llman-sdd validate --specs --strict 与项目 BDD 套件,全绿为收口标准。

人类该做什么:
- 审阅 diff 与 req 语义;把 # scope: 指向该规范管辖的真实源码目录(scope 承载 staleness 扫描,自引用无意义)。

陷阱:
- spec.toon 的引号转义存在两种历史风格("" 翻倍与 \\" 反斜杠),手工读表须逐一确认。
- 任何一行无法解析都停下来人工判定,勿凭猜测整表转换。`;

const TOON2FEATURES_EN = `llman-sdd project migrate --kind toon2features — legacy spec.toon → single-track .feature collaboration notes

Background: v1 (Rust ≤0.0.78) stored specs dual-track — specs/<cap>/spec.toon (table form) plus scattered .feature files; v2 reads single-track .feature only (specs/<cap>.feature or directory-style <cap>/<cap>.feature) and silently ignores spec.toon. This command performs no migration; the notes below are the manual procedure.

What the agent does:
1. Per capability, confirm a spec.toon actually exists (skip otherwise).
2. Read the spec.toon tables and convert: each requirements row → an @req:<id> @human rule scenario in <cap>.feature (id in the tag, statement verbatim in the description, MUST/SHALL required); each scenarios row: GWT-bearing (Given/When/Then) with a defined req_id → an @executable acceptance scenario linked back via @req:<req_id>; no GWT or undefined req_id → record the justification in proposal/design and drop — never silently.
3. Never overwrite an existing <cap>.feature — merge both sides by hand, then delete spec.toon.
4. After migration run llman-sdd validate --specs --strict and the project BDD suite; all-green is the bar.

What the human does:
- Review the diff and the req semantics; point # scope: at the real source directory the spec governs (scope drives staleness scanning; self-references are useless).

Pitfalls:
- spec.toon quoting has two historical escaping styles ("" doubling and \\" backslash); verify cell by cell.
- Any unparseable row means stop and judge by hand — never convert a whole table on guesswork.`;

const SPECS_FLATTEN_ZH = `llman-sdd project migrate --kind specs-flatten — 目录式 specs 归一为扁平 协作说明

背景:v1 曾把 capability 放在 specs/<cap>/<cap>.feature 目录;v2 两种布局都能读,但扁平 specs/<cap>.feature 是唯一写入形态(spec add-* / skeleton 按扁平拼写),归一属可选整理。本命令不执行迁移,以下为手工指引。

Agent 该做什么:
1. 仅处理「目录内只有一个 <cap>.feature、无其他文件」的纯目录;目标 specs/<cap>.feature 已存在(冲突)、目录内有多个 .feature、或有附属文件 → 报告并跳过,勿强迁。
2. 用 git mv specs/<cap>/<cap>.feature specs/<cap>.feature 保留历史,然后删除空目录。
3. 检查该文件 # scope: 是否自引用自身路径,是则改写为真实源码目录。
4. 迁移后运行 llman-sdd validate --specs 确认无 stale 警告。

人类该做什么:
- 审阅 git diff(move 保历史);确认 scope 指向真实管辖面。`;

const SPECS_FLATTEN_EN = `llman-sdd project migrate --kind specs-flatten — directory-style specs → flat collaboration notes

Background: v1 placed capabilities in specs/<cap>/<cap>.feature directories; v2 reads both layouts, but flat specs/<cap>.feature is the only write shape (spec add-* / skeleton spell flat paths), so flattening is optional housekeeping. This command performs no migration; the notes below are the manual procedure.

What the agent does:
1. Only handle pure directories (exactly one <cap>.feature inside, nothing else); if the target specs/<cap>.feature already exists (conflict), the directory holds multiple .feature files, or there are auxiliary entries → report and skip, never force.
2. git mv specs/<cap>/<cap>.feature specs/<cap>.feature to preserve history, then remove the emptied directory.
3. Check the file's # scope: for a self-referential path and rewrite it to the real source directory.
4. After migration run llman-sdd validate --specs and confirm no stale warning remains.

What the human does:
- Review the git diff (moves keep history); confirm scope points at the real governed surface.`;

const OVERVIEW_ZH =
  'legacy 迁移实现不随本工具提供;v2 直接读取既有 llmanspec 布局(config.yaml / specs/*.feature / changes/),零迁移可读。\n' +
  '两种历史迁移的协作说明:--kind toon2features | --kind specs-flatten。';

const OVERVIEW_EN =
  'Legacy migration implementations are not shipped; v2 reads existing llmanspec layouts directly (config.yaml / specs/*.feature / changes/), zero-migration readable.\n' +
  'Collaboration notes for the two historical migrations: --kind toon2features | --kind specs-flatten.';

/** stdout body for `project migrate --kind <kind>`; null when the kind is unknown. */
export function migrateNoteFor(kind: string, locale: string): string | null {
  const zh = isZh(locale);
  switch (kind) {
    case 'toon2features':
      return zh ? TOON2FEATURES_ZH : TOON2FEATURES_EN;
    case 'specs-flatten':
      return zh ? SPECS_FLATTEN_ZH : SPECS_FLATTEN_EN;
    default:
      return null;
  }
}

/** stdout body for bare `project migrate` (no --kind). */
export function migrateOverviewFor(locale: string): string {
  return isZh(locale) ? OVERVIEW_ZH : OVERVIEW_EN;
}
