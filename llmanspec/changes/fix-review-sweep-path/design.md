# Design: fix-review-sweep-path

## 根因定位(实证)

```
review.ts:47   discoverSpecs(join(root, 'llmanspec/specs'), io)   → 绝对 fileName
review.ts:65   buildReview({ entries }) → validateAllSpecs(entries)  → 未传 specsDir
validate.ts    specsDir = opts.specsDir ?? 'llmanspec/specs'      → 相对缺省
assignSpecIds  featureRelPath:仅剥 'llmanspec/specs/' 前缀        → 绝对名剥不掉
preferredSpecIdFromRel: 多段 rel → id = 全路径去扩展名            → 与 功能: 标题失配
```

对照:validate --all 经 `loadRootSpecEntries` → 根相对路径装载 → 前缀命中
→ 同树全绿。两命令装载形态不同而 id 推导只认一种形态,即合约裂缝。

## 修复方向(用户定案:修 B)

`featureRelPath` 后缀感知:前缀不中时,按完整路径段(两侧都有 `/` 边界)
定位 `specsDir` 在 fileName 中的**末次**出现,取其后段为 rel。选末次的
理由:嵌套同名目录(如 `…/specs/fixtures/specs/x.feature`)取最深宿主,
与「specs 树内相对位置」语义一致;无命中时维持现状(全路径),供目录式
capability 多段 id 继续工作。

- 不选 A(review 调用点补传 specsDir):一行修但陷阱留存,任何未来绝对
  路径调用方再次踩中;core 层修一次,所有调用方受益。
- 不动 `specIdOf`(本就走 basename);不动 review 调用点;不动 validate。

## 影响面与风险

- 相对路径既有行为逐字节不变(前缀快路径先行)——validate/list/index/
  context 全部既有调用方零感知,由全量 golden + 单测守护。
- 嵌套目录式 capability 的多段 id 语义不变(命中段之后的 rel 原样保留)。
- review 修好后,verify 报告中曾被掩盖的真实回归(若有)会浮出——已知的
  unbound 信号计数为 0,预期浮出物为零;若有新浮出按 apply 自修复处理。

## 验收口径

- 单测:绝对 entries + 缺省相对 specsDir → id = 基名;嵌套宿主取末次;
  相对既有输入不变。
- BDD(真实 CLI):临时仓 `review` 退出码 0;`review` 与 `validate --all`
  对同一树判定一致。
- 前后对比在 change 分支相对 merge-base 测量(main 上 review 全红为基线)。
