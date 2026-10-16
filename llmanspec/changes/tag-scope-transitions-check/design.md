# Design: tag-scope-transitions-check

## D1 tag 命名：`@transitions` / `@no-transitions`（否决 `@xstate`）

tag 写在 `.feature`（需求语义层），表达意图"这张表是/不是状态转移表"；xstate 是校验器实现细节。实现中 `createMachine` 仅做空结构 sanity（catch 为空），检查主力是 `@statelyai/graph` 的 BFS——`@xstate` 既高估其角色，又在换引擎时变成谎言。tag 命名锚定领域语义而非引擎厂商。

## D2 对前代"零 Tag"定案的定向修订

add-xstate-statechart-engine 定案"严禁任何新增 Tag"以压低跨语言概念负担。本 change 修订为：**无 tag 的默认路径保持零概念负担**（嗅探自动纳管照旧），tag 仅作双向覆盖，供（a）被误伤者豁免、（b）意图明确者强制。修订动机：隐式规则不可发现 + 全局开关粒度过粗，两者都无法用"零 tag"自洽解决；两个 tag 是该哲学下的最小修订面。

## D3 判定次序（场景级，短路求值）

1. 同一场景同时挂 `@transitions` 与 `@no-transitions` → ERROR（作者意图冲突，不猜测胜者）；
2. `@no-transitions` → 完全跳过（含残缺表，豁免即全豁免）；
3. `@transitions` → 强制纳管，特征列不全时由 E1 报"缺必填列"（响亮反馈）；
4. 无 tag → 现状嗅探判据不变：`from`/`初始状态`、`event`/`事件`、`to`/`目标状态` 三族列**至少两族**命中即纳管。

tag 作用于场景级；规则级级联为非目标（避免隐式继承歧义，v1 不做）。

## D4 E4 死锁门禁统一不变式

- 存在终态（出度为 0 的状态）：非终态状态 MUST 能到达任一终态，否则死锁 ERROR；
- 不存在终态（循环机）：状态 MUST 能回到初始状态（首行 `from`），否则陷阱 ERROR，消息如实表述（"cannot reach any terminal state" / "cannot return to the initial state" 按实际违反项）；
- 删除现恒真内层 `hasPath` 重复调用与实际不可达的 `onlySelf && !hasIncomingFromOther && !hasOutgoingToOther` 分支（该形态已被 E3 先行拦截）。

依据：E3 已保证全部状态从初始可达；无终态时"回不到初始"即离开主循环后无法回返的单向陷阱区（如 `A→B, B→C, C→B` 中 B/C 吞入后不可回 A），对状态机规约是值得拦截的缺陷；自然循环机（toggle、播放器环）均满足"可达初始"。

## D5 配置移除策略：宽松剥离 + WARNING（否决硬报错）

沿旧 `bdd` 段先例：loader 识别 `specs.check_transitions` 为已移除键，剥离不进解析结果，stderr 输出 WARNING 指引改用 tag。硬报错会连本仓自身 `config.yaml` 一起炸穿，且与 r5"未知字段宽松放行"基调冲突。JSON Schema artifact 同步删除该字段定义（`gen-schema --check` 门禁保持绿）。

## D6 行为变更面：嗅探缺省启用

存量仓库（未设 `check_transitions`）从"缺省关闭"变为"嗅探始终启用"。接受此变更的理由：本仓自身已启用多版本、误伤面经 `@no-transitions` 精确豁免、且"零配置默认安全"与 harness `check_command` 的显式 opt-in 不同——静态结构校验无执行副作用。升级说明落 `migrations/v0.8-v0.9/README.md`。

## D7 内省命令：`llman-sdd spec transitions`

- 归属 `spec` 助手族（spec authoring helpers——写转移表即 spec 创作）；
- 只读、零参数、人读 TOON 输出；内容（特征词别名、发现判据、tag 语义、E1–E4 清单）由 core 导出单一事实源常量，CLI 仅渲染——规则演进只改 core 一处；
- v1 不提供 `--output json`：无程序化消费方，避免提前固化输出结构。

## D8 否决"低置信度降级 WARNING"

（brainstorm 备选：仅两族命中 → WARNING 而非 ERROR。）否决理由：打破"零逃逸 ERROR 门禁"的既定哲学（anti reward-hacking），且豁免已有精确工具 `@no-transitions`；引入级别漂移收益为负。

## D9 skills 模板零改动

规则细节不进模板（会漂移、违模板稳定性目标）；发现路径：`llman-sdd spec --help` → `spec transitions`，以及迁移文档。后续若有模板改写需求，另立 change。

## 测试 seam

复用既有 BDD harness seam（`tests/bdd/` Gherkin→bun:test）：r104/r102/r105 新场景驱动 CLI 子进程边界；core 单测（`tests/unit/transitions.test.ts`、`config.test.ts`）钉判定次序与 E4 不变式。
