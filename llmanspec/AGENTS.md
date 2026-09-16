<!-- LLMANSPEC:START -->
# llmanspec AGENTS.md

此文件由根目录的 `AGENTS.md` 托管块引用。可在此添加项目特定的规则、
上下文或约定，以便 AI 代理遵守。

<!-- 在此行下方添加你的规则 -->
<!-- LLMANSPEC:END -->
# llmanspec AGENTS.md

This file is referenced by the root `AGENTS.md` managed block. Use it to add
project-specific rules, context, or conventions that you want AI agents to follow.

<!-- Add your rules below this line -->

## 项目定位

llman-sdd:spec 驱动开发(SDD)工作流(TypeScript + Bun),将完全接替 Rust llman 中的 sdd 子系统。
项目全程用 llman SDD 管理(狗粮模式):SDD 流水线当前由 Rust llman 0.0.x 承载,发布切换后由本工具自身承载。

- v1 契约参考(只读,禁止修改):`../llman/crates/llman-sdd`
- 本工具行为契约:`llmanspec/specs/*.feature`(随各 change 在特性分支上落地)
- 总路线图:Phase 0–7 见首个 change 的 proposal.md

## 技术栈(已定案)

- 运行时 Bun(`.bun-version` 钉版)+ TypeScript(仅 typecheck,不参与构建);**双运行时兼容:Node >= 24**(`.node-version` 钉版 + engines 声明)——运行时代码(packages/*、apps/* 的 src)只准用 `node:` / Web 标准API,禁用 Bun 专属 API(Bun.$、Bun.file、Bun.Glob 等);Bun 专属 API 仅允许出现在构建/测试脚本(scripts、build-binary、tests/)
- Monorepo:Bun workspaces;`packages/core` 纯域逻辑 / `apps/cli` 命令入口;`apps/web` 预留(打包器已定案 **rsbuild**,内置 rspack 引擎;启动 web 交互功能时以独立 change 引入,CLI 与二进制分发不经过打包器——Bun 直跑 TS + `bun build --compile`)
- 工具链:oxlint + oxfmt(oxc 双件套)、tsc --noEmit、prek(git hooks)、justfile(任务编排);oxfmt 忽略 `llmanspec/` 与 `AGENTS.md`(SDD 托管文件,格式归 llman 管,避免 `init --update` 回打漂移)
- 依赖映射:commander(CLI)/ nunjucks(模板)/ @inquirer/prompts(向导交互)/
  @cucumber/gherkin(spec 解析,官方 i18n 已含 zh-CN「规则」)/
  zod + zod-to-json-schema + yaml(配置契约与注释保留)/ 7z-wasm(冻结冷备)/
  jsonrepair / cli-table3 + picocolors
- 测试:bun:test(含 `bun build --compile` 产物冒烟)+ @cucumber/gherkin + 自研
  Gherkin→bun:test runner(`tests/bdd/`,见工程规则 BDD 条)——BDD 选型已终局

## 范围决策(定案,勿反复)

- 保留:archive freeze/thaw(核心功能;`.7z` 格式必须与 v1 冻结产物双向兼容)
- `project migrate`:保留子命令入口,内容为指向 v1(Rust llman ≤ 0.0.x)的引导提示,不移植迁移实现
- 移除:`project import`(OpenSpec 互导)、worktree 并行 change、checkpoint/delta 兼容桩、rust-i18n
- ink 是 TUI 战略方向(v1 不引入):所有交互走 PromptDriver 接口;ink 与 inquirer 禁止同进程混用
- 测试/构建选型终局,rust 生态工具不迁移:rstest 仅适用 Rust 栈,本仓库以
  bun:test + Gherkin runner 承担同等角色;rsbuild/rspack 属 web 阶段(见技术栈
  Monorepo 条),现阶段 CLI/测试链路零打包器——后续需求直接引用本条,勿重新调研

## 工程规则

- `packages/core` 保持纯域逻辑:文件系统 / git / 终端副作用一律经接口注入,便于 golden 对照测试
- 模板引擎收敛在 TemplateEngine 适配器后:nunjucks 需 `autoescape: false`,trim/尾换行语义对齐 minijinja
- 验收基线:同一 fixture 上 v1 与 v2 的 validate/list/show 输出 diff 为空;
  skills 生成物与 v1 在相同 config(locale/bdd)下的渲染产物 diff 为空
- BDD:移植 crystalith 的 Gherkin→bun:test runner(~200 行)至 `tests/bdd/`;
  带 `@executable` 标签的场景必须可被 `bun test tests/bdd` 执行
- specs 写法:zh-CN Gherkin 关键字(功能/场景/规则),与 `locale: zh-Hans` 一致

## 语言约定

- change 文档(proposal/design/tasks)用中文;代码、标识符、CLI 输出文案用英文
- commit message:conventional type 前缀(英文)+ 中文描述,如 `feat(sdd): 新增校验引擎`
