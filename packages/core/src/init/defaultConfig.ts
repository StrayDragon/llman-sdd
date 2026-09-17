/**
 * Default llmanspec/config.yaml templates, extracted verbatim from v1
 * (crates/llman-sdd/src/sdd/project/config.rs DEFAULT_CONFIG_EN/ZH_HANS).
 */
export const LLMANSPEC_SCHEMA_URL =
  'https://raw.githubusercontent.com/StrayDragon/llman/main/artifacts/schema/configs/en/llmanspec-config.schema.json';

export const DEFAULT_CONFIG_EN = `schema: spec-driven
locale: en

# Optional extra skills (disabled by default, uncomment to enable).
# On \`llman-sdd init --update\`, managed candidates are:
#   default workflow skills + entries listed here (extra_skills extend).
# Then \`.agents/skills/llman-sdd-*\` is scanned: anything not in that candidate
# set is removed first, then candidates are written/updated. Only the
# \`llman-sdd-\` prefix is touched (custom skills without that prefix are kept).
# Deprecated shipped skills (e.g. removed from defaults) are cleaned this way.
# extra_skills:
#   - llman-sdd-continue
#   - llman-sdd-ff
#   - llman-sdd-validate
#   - llman-sdd-arch-review
#   - llman-sdd-wayfinder
#   - llman-sdd-research

# BDD integration (optional, uncomment to enable)
# bdd:
#   framework: pytest-bdd
#   feature_dir: tests/features/
#   # default_language: en
#   # Filtered runners: include {feature_*} so validate --all/--specs runs per capability.
#   # run_command: "pytest {feature_dir} -k {feature_name} -v"
#   # Project-wide runners (no placeholders): validate --all/--specs runs the suite once (batch-once).
#   # run_command: "cargo test --features bdd"
#   # verify_prompt: |
#   #   Map test failures to requirement IDs.
`;

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

# BDD 集成（可选，取消注释以启用）
# bdd:
#   framework: pytest-bdd
#   feature_dir: tests/features/
#   # default_language: zh-CN
#   # 过滤型 runner：写 {feature_*}，validate --all/--specs 按 capability 分别执行。
#   # run_command: "pytest {feature_dir} -k {feature_name} -v"
#   # 项目级 runner（无占位符）：validate --all/--specs 整批只跑一次（batch-once）。
#   # run_command: "cargo test --features bdd"
#   # verify_prompt: |
#   #   将测试失败映射到对应的 requirement ID。
`;

export function prependSchemaHeader(content: string, schemaUrl: string): string {
  const header = `# yaml-language-server: $schema=${schemaUrl}`;
  if (content === '') return `${header}\n`;
  return `${header}\n${content}`;
}
