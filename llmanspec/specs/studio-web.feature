# language: zh-CN
# purpose: 定义 Studio Web 自举交互工作台、Hono 本地单实例 Hub、Zod 端到端契约、透明 HTTP GET 内容协商、非破坏多叉世界线、6 条设计真言、XState 推演与单二进制共同分发契约。

功能: studio-web

  @req:r143
  规则: 自举 Studio Web 主状态流转
    Studio Web 自身作为首个自举状态机规范样例，6 大主态流转 MUST 通过 E1–E4 图门禁校验（无不可达孤岛、无确定性冲突、无死锁陷阱），并在 `--demo` 模式下作为默认内置模型载入。

    @transitions
    场景大纲: Studio Web 主态流转
      假如 当前处于 <from> 状态且满足 <guard>
      当 触发 <event> 事件
      那么 流转至 <to> 状态

      例子:
        | from           | event          | guard    | to             |
        | 启动与工作区就绪 | 打开主视图或深链 |          | 主视图与导航态 |
        | 主视图与导航态 | 切换工作区或标签 |          | 启动与工作区就绪 |
        | 主视图与导航态 | 进入规格编辑   |          | 画布直编与草稿态 |
        | 画布直编与草稿态 | 启动单步推演   |          | 推演试跑态     |
        | 推演试跑态     | 退出推演       |          | 画布直编与草稿态 |
        | 画布直编与草稿态 | 打开世界线与对比 |          | 世界线与验收闭环 |
        | 世界线与验收闭环 | 回到画布继续微调 |          | 画布直编与草稿态 |
        | 世界线与验收闭环 | 校验通过保存变更 | 门禁全绿 | 写保护与保存变更 |
        | 写保护与保存变更 | 确认生效返回   |          | 主视图与导航态 |

  @req:r144
  规则: 本地单实例 Hub、Zod 端到端契约与回环安全
    前置依赖 @req:r128 的核心状态机 IR 协议与 @req:r11 的全仓规格校验约束；后置协同输出面向 @req:r134 CLI 协商命令与 @req:r141 MCP 工具链的统一本地草稿与内容协商入口。
    `llman-sdd studio` MUST 提供基于纯 Web 标准 `Hono` 与 `@hono/node-server` 的本地回环服务（`studio open` / `studio serve --foreground` / `studio stop`），仅监听 `127.0.0.1` 且零 `Bun.*` 专属调用以遵守双运行时纪律。
    前后端 REST、SSE 与 Hub 元数据 MUST 共享 `packages/core/src/studio/contracts.ts` 的 Zod v4 契约 SSOT；非法写请求 MUST 返回 HTTP 400 并附字段路径。
    服务 MUST 提供 `/api/health` 探活与 `~/.llman-sdd/studio-hub.json` 僵尸锁自愈；写接口 MUST 校验回环 `Host`/`Origin` 与会话 `X-Studio-Token`；`/api/bootstrap` 仅下发轻量索引并由 `/api/specs/:capId` 按需懒加载正文；`PUT /api/states/:id` MUST 经 `If-Match`（`revision`）防多标签与并发 Agent 覆写并返回 `409`，且严禁直写 `llmanspec/specs/`。

    场景: 本地 Hono 回环服务校验 Zod 契约、并发乐观锁、回环安全与懒加载
      假如 一个包含真实规格与本地草稿的临时仓库并启动随机端口 Studio 服务
      当 依次请求健康检查、索引与懒加载接口、非法 Zod 载荷、缺令牌写请求及过期版本号更新
      那么 健康检查与索引懒加载返回合法 Zod 契约数据
      而且 非法载荷返回 400、缺令牌写请求被拒绝、过期版本号返回 409 且 specs 目录零修改

  @req:r145
  规则: 透明 HTTP GET 内容协商与 TextFold 双层折展代理
    Canonical Deep-Link `/p/:wsKey/*` MUST 支持透明 HTTP `GET` 内容协商：浏览器请求（`Accept: text/html` 或 `?format=html`）返回 Studio SPA 并内嵌 `<script type="application/json" id="studio-focus-context">`；非浏览器 HTTP 客户端默认返回精简 `text/markdown` 规格与聚焦摘要及路由提示，`?format=json` 返回结构化 JSON。
    `POST /api/textfold/fold` MUST 优先命中本地 `sha256` 缓存，未配置外部 TextFold 服务或服务不可达时静默降级至本地确定性 AST 5 级折展（零外部依赖）。

    场景: 同链内容协商区分浏览器与 Agent 且 TextFold 离线确定性降级
      假如 一个已启动的随机端口 Studio 本地服务
      当 以不同 Accept 与 format 参数访问深链并调用 TextFold 折展接口
      那么 非浏览器请求默认返回 Markdown、format=json 返回合法 JSON、HTML 响应内嵌 studio-focus-context
      而且 未配置外部服务时 TextFold 返回本地 AST 5 级折展并命中缓存

  @req:r146
  规则: 非破坏多叉世界线、全量锚点评论与 0-LLM 决策树投影
    `packages/core/src/studio/` MUST 向后兼容扩展 5 类统一 `SemanticAnchor`（`machine`/`state`/`edge`/`forest`/`macro-edge`/`doc`）、评论完整 CRUD（编辑/重开/删除）、非破坏多叉世界线（`TimelineEntry.parentId` 与 `actor`，提交仅追加不截断既有分叉）、规则与决策表文档草稿 `docDrafts`、手拖连线弧度 `edgeBends`、并发 `revision`、净 Diff 边语义签名消元，以及 0-LLM 确定性决策表到决策树 IR 编译。

    场景: 非破坏世界线分叉保留历史、评论全生命周期与 0-LLM 决策树编译
      假如 一份包含状态机、规则文档与决策表的 Studio 会话数据
      当 从历史节点创建人类与 Agent 平行分叉、编辑重开删除评论并编译决策表
      那么 世界线同时保留两个平行分叉且净 Diff 对冲假边噪音
      而且 评论 CRUD 与 0-LLM 决策树节点结构全部准确无误

  @req:r147
  规则: Studio Web 6 条设计真言与单二进制共同分发
    Studio Web 生产实现 MUST 遵守 6 条设计真言：触点同侧展开（右上角世界线由右侧滑出且小地图左让）、顶栏浮层单槽互斥（实时对比条优先于诊断条与小贴士）、默认连线零穿卡（避障通道路由）、连线与标签互斥且支持按住标签手拖微调、领域分组按工作区排他隔离、以及产品级视觉与文案洁癖（统一单色线框 SVG 严禁彩色 Emoji 滥用，UI 严禁出现预留/占位/Demo 模拟按钮）。
    `apps/studio` 经 `rsbuild build` 产出静态 `apps/studio/dist/`；`apps/cli/scripts/build-binary.ts` MUST 将静态产物编译期嵌入单可执行文件，运行时静态托管优先读内存嵌表并在源码或 npm 态自动回退磁盘目录。

    场景: 避障互斥边路由零穿卡零叠字且静态产物构建与双路径托管就绪
      假如 Studio 前端避障互斥路由器、设计洁癖检查与构建产出目录
      当 对多行跨列与双向边执行路由计算并校验静态构建产物不含开发态占位文案
      那么 所有默认路由零穿卡零标签重叠且构建产物可被本地服务正确托管

  @req:r148
  规则: 单步推演编译与变更依赖实时图
    `apps/studio` MUST 在前端基于 `xstate` v5 将 `StudioMachineIR` 编译为可执行本地 actor 并通过原生 `inspect` 捕获微步轨迹（`xstate` 不得污染 `packages/core`）；实时「变更依赖」视图 MUST 消费 `graphMermaid` 并保留 `obsidianmd/pele` 用于 Mermaid 渲染。

    场景: 状态机编译为 XState actor 按守卫开关单步推演
      假如 自举 Studio Web 状态机 IR 与守卫开关映射
      当 调用前端 XState 编译器创建 actor 并分别在守卫为假与为真时触发转移
      那么 守卫为假时转移被拦截且守卫为真时正确流转并记录微步轨迹

  @req:r151
  规则: 逻辑漂移校准与反向红绿对账裁决交互
    当 Studio Web 检测到 `source: 'drift-trace'` 的 `pending` 修订建议时，MUST 使用正式术语「逻辑漂移校准」，严禁在生产界面合入任何 `[DEMO-SIM]` 模拟触发器；MUST 遵守 6 条设计真言，在顶栏单槽互斥区提示未登记转移数量，在左侧 1:1 可交互画布以绿色虚线边叠加展示 Trace 观测转移，并记入右侧世界线抽屉。
    人类 MUST 能显式执行二选一裁决：「真理胜出」打开可视化预编辑「生成调整 Prompt」大窗（附 Trace 证据与精确对象锚点，零盲复制）；「追认新意图」将建议原子采纳进草稿与世界线、触发防抖保存并运行图方言 Linter，最终经底栏「保存变更」分支护栏补录规格。

    场景: 逻辑漂移校准在画布叠加虚线绿边并完成真理胜出与追认新意图双出口
      假如 一份包含 drift-trace 待审建议的 Studio 会话文档
      当 分别生成逻辑漂移画布叠加、真理胜出修正 Prompt 与执行追认新意图采纳
      那么 漂移叠加包含新增状态与虚线绿边、真理胜出 Prompt 含 Trace 证据与锚点
      而且 追认新意图原子写入草稿与 agent 世界线节点且标记建议已采纳

  @req:r154
  规则: 工作区隔离 /api/views 视图路由、多 Tab 管理与动态快速引导页
    Studio 本地回环服务 MUST 提供按 `llmanspec/` 实例严格隔离的 `GET /api/views` 与 `PUT /api/views`（经共享 Zod 契约校验、同目录临时文件原子 `rename` 写 `.llman-sdd/studio/views.json` 并经 SSE 广播 `views-updated`，严禁直写 `llmanspec/specs/`）。
    Studio Web 默认 MUST 仅开启 1 个置顶「主视图」Tab（单色 SVG 图标，无彩色 Emoji），支持拖拽换序与右键置顶/关闭/恢复默认；点 `+` 或无打开 Tab 时 MUST 进入按当前工作区动态聚合真实规格与 `#tag (count)` 的「快速引导页」（零跨仓串味），且过滤命中 0 节点时 MUST 展示清晰空态恢复卡而非白屏。

    场景: /api/views 按实例隔离原子读写并保持 specs 目录零改写
      假如 一个已启动的随机端口 Studio 本地服务
      当 先读取默认视图配置再经 PUT /api/views 写入自定义领域 Tab 与人工虚线并重读
      那么 默认视图仅含主视图且自定义视图原子落盘、非法载荷返回 400 且 specs 零修改

  @req:r155
  规则: 排他领域分组空间守卫、Shift+拖框批量操作、交叉桥高亮与外部契约门户预览
    主视图与自定义森林 Tab MUST 执行排他空间守卫 `enforceExclusiveGroupSpaces`，保证任意领域分组包围盒绝不误包任何非成员节点；画布 MUST 支持 `Shift+拖框` 批量操作条（打包分组 / 新建 Tab 视图 / 打 Tag）、自定义 Tab 的「+ 显示外部 1 跳接口」与「交叉桥」高亮、以及宏观写入红线（结构增删改名仅进草稿与协商 Prompt/`proposal.md`，绝不直改 `llmanspec/specs/*.feature`）。
    进入状态机或流程图 Tab 后，外围 MUST 渲染自动提取的上游约束与下游契约门户及跨界虚线，点击门户 MUST 就近展示 `evidence` 预览并提供「新 Tab 打开」与「回到全景」双动作。

    场景: 排他分组空间守卫零误包、交叉桥高亮与外部契约门户证据提取准确
      假如 包含领域分组、跨组契约边与非成员节点的宏观森林布局
      当 执行排他空间守卫、交叉桥计算与外部契约门户证据解析
      那么 任意分组包围盒零误包非成员节点且交叉桥与外部门户证据列表完整准确

  @req:r156
  规则: 真实浏览器 E2E 视觉不变量独立门禁
    Studio Web MUST 提供独立于 `just qa` 的真实浏览器门禁 `just qa-studio-e2e`：进程内以端口 0 且不写 Hub 文件的方式启动本地服务，加载临时 git 夹具仓中复制的全部真实规格，在 `1440×900` 与 `1280×800` 两档视口下采集 DOM/SVG 几何与可见文本。
    采集结果 MUST 交由与浏览器无关的纯几何判定器裁决 6 条设计真言（抽屉同侧且不压小地图、顶栏中轴可见浮条数不超过 1、连线零穿非端点卡片、边标签两两零重叠、分组包围盒零误包非成员、可见文案零彩色 Emoji 与零开发态占位词），并锁定拖拽节点零页面异常、小地图含节点预览、原生右键被禁用与跨工作区切换刷新零丢失等回归；任一违规 MUST 以非零退出码失败并保存现场截图。

    场景: 纯几何判定器对违规布局逐条报错且对干净布局零误报
      假如 一组同时违反 6 条设计真言的浏览器几何快照与一组干净快照
      当 分别交由 Studio E2E 纯几何判定器裁决
      那么 违规快照逐条命中 6 类违规且干净快照零违规
      而且 justfile 提供独立 qa-studio-e2e 门禁且日常 qa 不依赖浏览器

  @req:r157
  规则: 交互式引导向导、注册表快捷键速查、多选排版只写冷表、只读快照导出与缩略对比度基线
    Studio Web MUST 在 `画布` 设置面板提供按需重播的 6 步交互式引导向导（默认不弹窗阻断常规用户），并在非输入态支持 `?` 唤起由注册表驱动、按当前视图方言过滤且仅列出已接线项的快捷键速查卡（同步支持宏观 `G`/`T` 与方向键微调）。
    画布多选排版（左/中/右/顶/中/底对齐、水平/垂直等距分布与网格整理）MUST 仅更新冷表坐标且零污染语义 Diff；视觉分享 MUST 仅提供适配双亮色皮肤的只读 SVG/PNG 快照导出；`linear` 与 `washi` 两套亮色皮肤的默认连线与强边框相对画布背景对比度 MUST 不低于 3.0:1，确保 50%–75% 缩略视角清晰可读。

    场景: 快捷键注册表按视图过滤、多选对齐分布准确且双皮肤对比度满足非文本基线
      假如 Studio 快捷键注册表、多选节点坐标集合与双皮肤颜色令牌
      当 按视图过滤快捷键、执行多选对齐与等距分布并计算双皮肤边框连线对比度
      那么 仅返回已接线快捷键、多选坐标精确对齐分布且双皮肤默认连线与强边框对比度均不低于 3.0

  @req:r159
  规则: Studio 面板内搜索（⌘F）、/api/search 深度全文召回与可选回环 RAG 代理降级
    Studio 本地回环服务 MUST 提供按工作区隔离的 `POST /api/search` 与 `POST /api/p/:wsKey/search`：默认以 Tier 0 本地 BM25 零依赖召回；显式配置外部 RAG serve 时 MUST 强制回环 SSRF 守卫（非回环地址返回 400），外部超时或不可达时 MUST 无感降级回 `local-bm25` 并标记降级原因，零内置大模型 Key 耦合。
    Studio Web MUST 在画布与文档视图统一支持 `⌘F` 面板内搜索（就近浮条不占用顶栏单槽，支持 `i / N` 计数、`Enter`/`Shift+Enter` 定位及 L2/L3 嵌套子图穿透），并在 `⌘K` 与 `+ 新标签页` 展示带召回来源标识（`RAG 语义` / `本地全文`）与命中片段的深度检索结果。

    场景: /api/search 执行工作区隔离 BM25 召回、拦截非回环 RAG 地址并在 RAG 不可达时无感降级
      假如 一个已启动的随机端口 Studio 本地服务
      当 先以中文关键词请求 /api/search，再传入非回环与不可达回环 RAG 地址
      那么 本地 BM25 返回带片段的排序命中、非回环 RAG 地址返回 400 且不可达回环 RAG 无感降级回 local-bm25

  @req:r162
  规则: Studio 人类定理只读加载、深度检索召回与右锚预览抽屉
    Studio 本地回环服务 MUST 在 `/api/bootstrap` 返回当前工作区 `llmanspec/theorems/` 的只读定理列表与封签状态，并在 `/api/search` 将定理正文与关联 `gate` 纳入本地 BM25 索引（`targetKind: 'theorem'`）；服务 MUST NOT 暴露任何修改或覆盖定理文件的写入端点。
    Studio Web MUST 提供与世界线抽屉互斥的右锚只读「人类定理」预览抽屉（遵守真言 1 同侧展开且小地图左让），展示只读锁状态、条目筛选、statement/rationale/gate 与人类命令行解锁提示。

    场景: /api/bootstrap 返回只读人类定理且 /api/search 可召回定理条目
      假如 一个含人类定理与封签的随机端口 Studio 本地服务
      当 请求 /api/bootstrap 与以定理关键词请求 /api/search
      那么 bootstrap 包含该定理与封签状态且 search 返回 targetKind 为 theorem 的命中结果
