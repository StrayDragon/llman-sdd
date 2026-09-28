---
depends_on: []
branch: sdd/unify-source-dialect
base_branch: main
base_sha: 601c79968e01222990a206721c95909c6eabf898
---

# 源文件方言判定统一口径

## Why

方言感知的关键字发射(shared in use-official-keywords change)目前有两套并存的「无头自动发现」逻辑:`migrateNative.ts` 的 `sourceDialect`(头注释 → 官方匹配器兜底链解析结果)与 `authoring.ts` 的 `dialectOf`(头注释 → `功能:` 探测 → en)。两套口径对同一文件可能给出不同答案(如含 `功能:` 字样的破损文件),且 r41 措辞把 `功能:` 探测写进了合约——探测只是实现细节,不该是合约面。

用户定向的统一口径:**文件 `# language:` 头注释优先(每文件统一配置)→ 无头内容自动发现(官方匹配器语言兜底链,en 起步 zh-CN 回退)→ 最后兜底英文**。

## What Changes

- `parser.ts` 新增共享判定函数 `sourceDialect(source)`:头注释优先 → 兜底链自动发现(`parseFeatureSource` 的 en/zh-CN 链)→ 不可判时返回 en。未知名的头值原样返回(调用方经 `officialKeywordsOrEn` 落到 en 关键字;migrate 的产物解析自检对真正破损的头 fail-closed)。
- `migrateNative.ts` 删除本地 `sourceDialect`,`analyzeLegacy()` 改用共享函数(行为不变:头 > 链;链失败在 analyzeLegacy 更早处已报错)。
- `authoring.ts` 删除本地 `dialectOf`,`keywordsOf()` 改用共享函数。对所有可解析输入行为逐字节不变(头注释 zh 文件、无头 zh/en 文件结果一致);对无头且不可解析的文件,结果同为 en 兜底(原先探测路径)。
- specs 措辞同步:r41 括注改为统一口径;r88 括注补「不可判兜底英文」,两处引用同一判定顺序。

## Capabilities

- `specs/spec-parsing`:r88 括注补全统一口径。
- `specs/spec-authoring`:r41 括注改为统一口径(移除 `功能:` 探测措辞)。

## Impact

- `packages/core/src/spec/parser.ts`(新增导出)、`migrateNative.ts`、`authoring.ts`(各删一份本地实现)。
- `tests/unit/spec.test.ts`:sourceDialect 判定顺序单测(头优先/无头 zh 自动发现/无头 en/garbage → en/未知名头原样返回)。
- 行为对全部合法输入不变;两套发现逻辑收敛为一,消除同文件不同答案的可能。
