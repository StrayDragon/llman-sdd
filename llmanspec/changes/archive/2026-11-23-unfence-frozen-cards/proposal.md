---
depends_on: []
title: 冻结卡归一为通用单文档 YAML
branch: sdd/unfence-frozen-cards
base_branch: main
base_sha: d221df31651a9f0fddd099e1cd973c114fed087b
---

## Why

冻结平铺卡目前存在两种形态:0.9 时代 `frozen: sha256` 元数据卡留下 `---` 围栏,现行
`composeFrozenCard` 只写 `title` + `depends_on` 两行的无围栏单文档 YAML。规格把前者定义
为「存量格式,不迁移」,于是读取侧必须长期兼容双格式。

后果落在用户仓库而非本仓库:凡在 0.9 期间跑过 `archive freeze` 的项目,归档目录里就留着
围栏卡;用户接上 pre-commit 官方 `check-yaml`(默认严格单文档)后,钩子对这批卡恒报
`only single YAML document expected but multiple found`。用户只能自己给钩子加豁免或改文件,
两种做法都要用户理解本工具的内部格式演进——不是开箱即用。

本仓库自身就是受害者:50 张卡全部围栏形态,`.pre-commit-config.yaml` 为此把 `check-yaml`
拆成严格/放宽两条才转绿。豁免让归档卡脱离通用 YAML 校验,属于用配置掩盖产物缺陷。

## What Changes

- 新增 `project migrate frozen-cards-unfence [--dry-run]`:扫描实例归档目录下的平铺卡,
  把「首行 `---` + 末行 `---`」的围栏卡归一为无围栏单文档 YAML,内容与行序原样保留;
  无围栏卡与非常规卡跳过;幂等。
- `archive thaw` 回置目录时,同批顺带归一该实例的围栏卡(回置本就要删卡重写归档区,
  是无感时机);`freeze` 仍只写无围栏卡。
- 读取侧双格式兼容保留:未跑迁移的老仓库照常可读;`graph` 的 archived 节点与依赖边不变。
- 规格措辞更新:`review-freeze` 把「存量围栏卡不迁移」改为「读取兼容 + 工具提供归一入口 +
  写侧只产无围栏」;`peripheral-commands` 的 graph 读取条款同步。
- 迁移手册补 0.10 窗口条目,说明升级后跑归一动作即可让归档卡满足通用单文档 YAML 校验。
- 本仓库 50 张围栏卡执行归一,`.pre-commit-config.yaml` 随之收回 `check-yaml` 双条目
  (归一后通用严格校验即可全绿),`quality-gates` 对账断言同步。

## Capabilities

- `review-freeze`:冻结卡形态与归一动作的合同。
- `peripheral-commands`:`project migrate` 动作面与 graph 读取兼容。
- `monorepo-structure`:本仓门禁回归单条 `check-yaml`。

## Impact

- 新增 CLI:`llman-sdd project migrate frozen-cards-unfence [--dry-run]`。
- 迁移登记表新增版本条目,`tests/unit/migrate-prompt.test.ts` 的版本清单断言需同步。
- 本仓库 50 个归档卡文件去围栏(纯格式差异,依赖解析逐条等值)。
- 无破坏性:围栏卡读取兼容不撤销;未跑迁移的用户行为不变。
