# Design:release-v2-and-cutover

## D1 分阶段生命周期与外发动作门(定案)

执行顺序:**T1 specs 承接改写 → T2 临时对拍扩充(v1 在场时榨干对照价值) → T3 发布工程(本地) → T4 狗粮切换 → T5 拆 v1 门 → T6 清理清单 → T7 发布执行**。
tag push / npm publish / GitHub release 属外发动作,MUST 由用户显式触发(T7 前置确认);T3 只做本地发布就绪(`npm pack` 干跑、二进制构建冒烟、workflow yml 落盘)。
切换的鸡生蛋裁决:本 change 自身的 finalize 仍由 v1 llman 收口(流水线所有权在 finalize 之后才归 v2),`init --update` 切换对后续 change 生效。

## D2 拆门后的回归承接(定案:全部移除,SSOT=llmanspec)

- `golden:cli` / `golden:validate` 脚本与 justfile/package 入口:删除。其合约价值已由 specs r1–r29 的 `@executable` 场景与单测承接,不再有外部对照物。
- `golden:check`:保留脚本、**基线重采**——`generate.ts` 改为调 v2 `runInit` 采样,`tests/golden/baseline/` 成为 v2 自有快照(VERSION 标记保留),check 语义不变(归一化版本号 diff)。
- BDD 活体场景:按 Specs landing 改写为 v2 自承接(freeze 自洽 roundtrip、list/graph 结构断言);`run.test.ts` 的 `HAS_V1`/`V1_PARITY_SCENARIOS` 跳过机制随之移除。
- `scripts/temp-parity-v1.ts`(T2 产物)与 README 门禁表、`docs/acceptance-v2.md` 同步改写为纯 v2 口径。

## D3 狗粮切换语义

`bun apps/cli/src/main.ts init --update` 对本仓库执行(源码形态,不依赖已发布产物):验收 = ①skills 与切换前基线零漂移(golden:check 在拆门前仍绿)②根/llmanspec 两个 AGENTS.md 托管块完整、块外用户内容保留 ③`llman sdd list --specs` 等 v1 流水线命令在切换后仍可用(v1 管到本 change finalize)。

## D4 npm 发布布局(建议,publish 前用户确认)

单包 `llman-sdd`,bin 名 `llman-sdd`;**发布 TS 源码不打包**(项目哲学"TypeScript 仅 typecheck 不参与构建"),engines 声明 `bun >= 1.4 || node >= 24`(Node 24 type-stripping 直跑);`files` 白名单 core/cli src + README + LICENSE;`@llman-sdd/core` 以 workspace 引用,发布时随包内联 relative import 路径(单包内相对路径天然成立)。`llmanspec` 兼容 alias 首发不做,观察需求后另议。二进制(`--compile` matrix)是独立分发渠道,与 npm 包并行。

## D5 临时对拍扩充(临时,拆门时一并删除)

单脚本 `scripts/temp-parity-v1.ts` + justfile `parity-v1-temp`,复用 `tests/golden/lib.ts` 的 `runCapture`/`normalizeCliText`:矩阵覆盖 change 全子命令(new/start/diff/finalize 于临时仓)、fresh init 双栈产物对照(显式记录 llmanspec/AGENTS.md 托管块分歧:v1 不写块,v2 前置块——行为分歧已由 spec r19 裁决为 v2 形态)、freeze/thaw 参数组合(--before/--keep-recent/--dry-run/--list)、review --export-html、context 守卫与错误路径(退出码+输出形状)。结果摘要记入 `docs/acceptance-v2.md`,发现漂移即修。

## D6 Specs landing 内容(4 个 capability)

- **init-generators**:purpose 去 v1 基准措辞;r19 场景更名"渲染与基线归一化一致"(步骤文本零变更)。
- **validation**:r12 场景更名"规则域(种子缺陷判定)";scope 移除 `tests/golden/check-validate.ts`(T5 删除该文件,预清 scope 防漂移 ERROR)。
- **peripheral-commands**:purpose 去 v1 对照措辞;r20 human 去"按 v1 列布局"引用;r20 executable 改"输出结构合法"(list JSON 字段/枚举 + graph 首行);r22 migrate 文案去 v1 指引;scope 移除 `tests/golden/check-cli.ts`。
- **review-freeze**:purpose 改"7z 格式自洽双向回置";r25 human 跨版本兼容条款改 v2 自洽;r25 executable 改"冻结解冻自洽"(v2 freeze→thaw roundtrip)。

@human 语句修订将触发锁定报告 WARNING(报告制,不阻断),verify 阶段逐条核对。

## 风险

- landing 后至 T1 完成前,BDD 对改写场景缺步骤为红(与 refine change 同节奏)。
- npm 发布 TS 源码依赖 Node 24 type-stripping 的稳定性——D4 已用 engines 锁版本;二进制渠道不受影响。
- 真实发布(T7)不可逆,必须用户显式指令后才执行。
