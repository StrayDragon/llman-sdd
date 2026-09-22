<!-- LLMANSPEC:START -->

# llmanspec AGENTS.md

此文件由根目录的 `AGENTS.md` 托管块引用。可在此添加项目特定的规则、
上下文或约定，以便 AI 代理遵守。

<!-- 在此行下方添加你的规则 -->
<!-- LLMANSPEC:END -->

## 项目定位

llman-sdd:spec 驱动开发(SDD)工作流(TypeScript + Bun),将完全接替 Rust llman 中的 sdd 子系统。
项目全程用 llman SDD 管理(狗粮模式):SDD 流水线当前由 Rust llman 0.0.x 承载,发布切换后由本工具自身承载。

- v1 契约参考(只读,禁止修改):`../llman/crates/llman-sdd`
- 本工具行为契约:`llmanspec/specs/*.feature`(随各 change 在特性分支上落地)
- 进度:Phase 0–7(bootstrap + 全部 port-* + refine-slop-qa-release)已归档;
  活跃 change 以 `llman-sdd list` 为准,发布与切换见 `release-v2-and-cutover` proposal

## 技术栈(已定案)

- 运行时 Bun(`.bun-version` 钉版)+ TypeScript(仅 typecheck,不参与构建);**双运行时兼容:Node >= 24**(`.node-version` 钉版 + engines 声明)——运行时代码(packages/*、apps/* 的 src)只准用 `node:` / Web 标准API,禁用 Bun 专属 API(Bun.$、Bun.file、Bun.Glob 等);Bun 专属 API 仅允许出现在构建/测试脚本(scripts、build-binary、tests/)
- Monorepo:Bun workspaces;`packages/core` 纯域逻辑 / `apps/cli` 命令入口;`apps/web` 预留(打包器已定案 **rsbuild**,内置 rspack 引擎;启动 web 交互功能时以独立 change 引入,CLI 与二进制分发不经过打包器——Bun 直跑 TS + `bun build --compile`)
- 工具链:oxlint + oxfmt(oxc 双件套)、tsc --noEmit、prek(git hooks)、justfile(任务编排);oxfmt 忽略 `llmanspec/` 与 `AGENTS.md`(SDD 托管文件,格式归 llman 管,避免 `init --update` 回打漂移)
- 依赖映射:commander(CLI)/ nunjucks(模板)/ @inquirer/prompts(向导交互,经 PromptDriver
  端口接 v1 适配器,现阶段未安装)/
  @cucumber/gherkin(spec 解析,官方 i18n 已含 zh-CN「规则」)/
  @toon-format/toon(机器输出 TOON 编码,纯函数 encoder,add-render-layer 引入)/
  zod(zod v4 内建 toJSONSchema)+ yaml(配置契约与注释保留)/ 7z-wasm(冻结冷备)
- 测试:bun:test(含 `bun build --compile` 产物冒烟)+ @cucumber/gherkin + 自研
  Gherkin→bun:test runner(`tests/bdd/`,见工程规则 BDD 条)——BDD 选型已终局

## 范围决策(定案,勿反复)

- 保留:archive freeze/thaw(核心功能;`.7z` 格式必须与 v1 冻结产物双向兼容)
- `project migrate`:保留子命令入口,内容为指向 v1(Rust llman ≤ 0.0.x)的引导提示,不移植迁移实现
- 移除:`project import`(OpenSpec 互导)、worktree 并行 change、checkpoint/delta 兼容桩、rust-i18n
- ink 是 TUI 战略方向(v1 不引入):所有交互走 PromptDriver 接口;ink 与 inquirer 禁止同进程混用
- 测试/构建选型终局,rust 生态工具不迁移:rstest 仅适用 Rust 栈,本仓库以
  bun:test + Gherkin runner 承担同等角色;rsbuild/rspack 属 web 阶段(见技术栈
  Monorepo 条),现阶段 CLI/测试链路零打包器——后续需求直接引用本条,勿重新调研。
  撞名注意:config 的 `bdd.framework: rstest-bdd` 指 Rust rstest crate 生态;
  Rstack 的 JS 测试框架写作 Rstest(`@rstest/core`),同名不同物,讨论时消歧

- 输出对齐口径(2026-09 定案,toon-default-output 修订):v1→v2 对齐收窄为**兼容别名面**——`--json`/`--compact-json` 的输出结构与退出码保持 v1 字节一致;报告型命令(review/validate/list/show/config skills/index check)的**缺省输出自 0.4.0 起为 TOON**(`--output <toon|json|compact-json|human>`,human 为 v1 人读形态唯一入口),主动 divergence;其余人读文案细节(init 输出行、list 时间戳精度、start/finalize 文案、skeleton 头注释 locale 文案)不做逐字节对齐
- 不移植(定案维持):`show --output deltas/reqs-only` 与 `change checkpoint/delta` 随 checkpoint/delta 机制移除(相关调用固化为报错+指引,r53);worktree 并行、project import、migrate 实现体维持移除
- 锁定哈希门禁(v1 spec-format r135 / sdd-workflow r130)不移植:改/删 `@human` 规则的报告制 WARNING 由 git 分支对比 + `review`/`change diff` 浮现,不经 validate/finalize 报告通道;review 的 `locked` 信号恒 0 系有意(2026-09 定案,close-v1-parity-gaps 核验转正)
- `llmanspec/AGENTS.md` 托管块:v2 init 写入 LLMANSPEC:START/END 标记(v1 不写),属有意改进,保留

## Change Proposal Frontmatter SSOT

`changes/` 任意深度含 proposal.md 的目录都是 change(叶子目录名 = change id,扫描深度缺省 8,`--max-scan-depth` 可调)。frontmatter YAML 是变更元信息的唯一权威;生命周期阶段(stage/readyToImplement)由 CLI 从磁盘工件 + git 绑定实时推断,绝不写入 frontmatter;正文 MUST NOT 复读 frontmatter 字段,正文 H1 是人类可读标题而非 change id 的复读。

### 合法字段集(validation r64 强制)

| 字段 | 必填 | 谁写入 | 说明 |
|---|---|---|---|
| `depends_on` | 是(CLI 骨架默认 `[]`) | agent | 依赖 change id 列表,流式/块式均可(graph 解析) |
| `blocks` | 否 | agent | 反向依赖声明(当前仅校验列表格式) |
| `branch` | 否 | CLI(change start/attach) | 绑定特性分支 |
| `base_branch` | 否 | CLI(change start;attach --base 可覆盖) | finalize/archive 合并目标解析,缺键回退本地默认分支;不参与 diff 范围计算(现算 merge-base) |
| `base_sha` | 否 | CLI(change start) | 审计用基点,仅审计不参与范围计算 |
| `needs_specs_change` | 否(缺省 true) | agent | false 跳过 specs landing 检查(无 live 合约编辑的 change) |

合法集外字段(如 `status`/`title`/`priority`/`author`)→ validate 报 ERROR,错误消息列出字段名与合法集;`changes/archive/` 下的 proposal 免检。

### 已废弃/移除字段

- `stage` 不是 frontmatter 字段:实时推断 draft/designed/planned/full(绑定参与升级)。
- `checkpointed`/`checkpoint_sha`/`skip_specs_landing`/`rules_edit_acked`/`rules_touched`/`agent_acked` 已随 checkpoint/锁定确认机制移除——出现即 ERROR,无兼容读取。
- 锁定 `@human` 规则改动为报告制(见范围决策);改动经 git 分支对比与 `review`/`change diff` 审视。

## 工程规则

- `packages/core` 保持纯域逻辑:文件系统 / git / 终端副作用一律经接口注入,便于 golden 对照测试
- 模板引擎收敛在 TemplateEngine 适配器后:nunjucks 需 `autoescape: false`,trim/尾换行语义对齐 minijinja
- 验收基线:行为合约 SSOT 为 `llmanspec/specs/*.feature`;skills 生成物与
  v2 自有快照基线(tests/golden/baseline)在相同 config(locale/bdd)下归一化 diff 为空
- BDD:Gherkin→bun:test runner(`tests/bdd/`,~200 行,源自 crystalith 移植);
  带 `@executable` 标签的场景必须可被 `bun test tests/bdd` 执行
- specs 写法:zh-CN Gherkin 关键字(功能/场景/规则),与 `locale: zh-Hans` 一致
- 门禁 verbosity:`just qa` 默认 L0 静默(只用工具原生安静开关:`bun test
  --only-failures` / `oxlint --quiet` / `bun run --silent`,每步一行
  `[check]`/`[pass]` 摘要);`just QA_VERBOSE=2 qa` 全量输出排障。禁止
  grep/sed 过滤管道作门禁主路径;输出噪音先修根因(如泄漏的 logger、
  失效的 disable 注释);任何档位失败详情与 exit code 必须完整

## 语言约定

- change 文档(proposal/design/tasks)用中文;代码、标识符、CLI 输出文案用英文
- commit message:conventional type 前缀(英文)+ 中文描述,如 `feat(sdd): 新增校验引擎`
