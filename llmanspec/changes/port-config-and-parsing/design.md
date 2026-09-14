# Design

## 目标

把 v1 的 config 契约(`project/config.rs`)与 Gherkin 语义层(`spec/backend/feature_backend.rs`、`spec/ir.rs`、`req_registry.rs` 的扫描部分)等价移植到 `packages/core`,为 Phase 3+ 提供纯函数域层。

## 配置契约

- zod schema 逐字段对齐 v1:`schema`(必填,"spec-driven")、`locale`(默认 en)、`extra_skills`(六值枚举)、`archive{strict_defer,min_completion_ratio}`、`bdd{framework,feature_dir,default_language,run_command,verify_prompt,bindings[]}`、`sdd{branch_prefix,worktree_root,worktree_naming("id"|"hash"),merge_method("squash"|"ff")}`、`change_id{pattern,template}`;bindings 双形态 `kind:"tags"{tags[]}` / `kind:"scenario-attrs"{files[]}`
- 未知字段宽松(v1 schema 未设 additionalProperties:false),错误信息截断前 5 条
- YAML 用 `yaml` 包(后续 Phase 4 的 frontmatter 注释保留也走它)

## schema artifact

`scripts/gen-schema.ts`:zod-to-json-schema 产出 `artifacts/schema/configs/en/llmanspec-config.schema.json`(字段/描述与 v1 产物等价,config.yaml 首行 `$schema` 指向不变),`--check` 模式做漂移门禁(prek/CI 可挂)。

## Gherkin 语义层

- 解析链:`# language:` 头自动生效(en 匹配器起步)→ 失败重试 zh-CN → 仍失败报错;`localeToGherkinLang`:zh-Hans → zh-CN,其余透传
- 头注释 `# capability:`/`# purpose:`/`# scope:` 解析(缺失即结构错误,Phase 3 校验消费)
- 标签语义:`@req:rN` 提取;`@human`/`@executable`/`@manual` 分层——`@manual` 必须与 `@human` 同用,`@human` 与 `@executable` 互斥;Rule 块内嵌场景拒绝(直接错误)
- IR(`spec/ir.ts`):纯数据结构(CapabilityDoc / Requirement / Scenario / TagClass),不碰 IO
- 全局 rN 注册表(`spec/reqRegistry.ts`):扫描多文件收集 req id,报告跨文件重复

## BDD 接线(dogfood)

`run.test.ts` 增扫 `llmanspec/specs/*.feature` 的 `@executable` 场景;`tests/bdd/steps/domain.ts` 用 core 真实 API(config 加载、spec 解析)实现步骤——specs 里的可执行场景就是本层验收测试。root devDependencies 增 `@llman-sdd/core: workspace:*`。

## 测试策略

- 单元:bun:test(config 校验样本、解析链兜底、tag 互斥、registry 重复)
- BDD:`@executable` 场景 + `llman sdd validate --specs`(v1 侧全量门,含 `--check` 跑 runner)
