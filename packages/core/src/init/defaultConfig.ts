/**
 * Default llmanspec/config.yaml body (init-generators r19/r50): one built-in
 * locale (zh-Hans), ported from the predecessor (crates/llman-sdd/src/sdd/
 * project/config.rs DEFAULT_CONFIG_ZH_HANS).
 */
import { DEFAULT_LOCALE } from '../locale.ts';

export const LLMANSPEC_SCHEMA_URL =
  'https://raw.githubusercontent.com/StrayDragon/llman/main/artifacts/schema/configs/en/llmanspec-config.schema.json';

export const DEFAULT_CONFIG_ZH_HANS = `schema: spec-driven
locale: zh-Hans

# 可选额外技能（默认禁用，取消注释以启用）。
# 运行 \`llman-sdd init --update\` 时，管理候选集为：
#   默认 workflow 技能 + 本列表（extra_skills 扩展）。
# 然后扫描 \`.agents/skills/llman-sdd-*\`：不在候选集中的先删除，再写入/更新候选。
# 仅处理 \`llman-sdd-\` 前缀（无此前缀的自定义技能不会被删）。
# 已废弃的内置技能（从默认集移除后）会因此被正确清理。
# extra_skills:
#   - llman-sdd-continue
#   - llman-sdd-ff
#   - llman-sdd-validate
#   - llman-sdd-arch-review
#   - llman-sdd-wayfinder
#   - llman-sdd-research

# Spec 验证（可选，取消注释以启用）
# specs:
#   framework: pytest-bdd
#   # 过滤型 runner：写 {feature_*}，validate --all/--specs 按 capability 分别执行。
#   # check_command: "pytest {feature_dir} -k {feature_name} -v"
#   # 项目级 runner（无占位符）：validate --all/--specs 整批只跑一次（batch-once）。
#   # check_command: "cargo test --features bdd"
#   # verify_prompt: |
#   #   将测试失败映射到对应的 requirement ID。
`;

export function prependSchemaHeader(content: string, schemaUrl: string): string {
  const header = `# yaml-language-server: $schema=${schemaUrl}`;
  if (content === '') return `${header}\n`;
  return `${header}\n${content}`;
}

/**
 * Built-in default config bodies by normalized locale. The lookup keeps the
 * single-source shape of the locale chain (r18/r50): a locale is normalized
 * first, then resolved; no exact-string comparison on the raw input.
 */
export const DEFAULT_CONFIGS: Readonly<Record<string, string>> = {
  [DEFAULT_LOCALE]: DEFAULT_CONFIG_ZH_HANS,
};
