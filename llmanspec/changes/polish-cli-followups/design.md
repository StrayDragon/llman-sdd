# Design: polish-cli-followups(authoring helpers 目录式支持)

## 决策 1:自动发现 vs --layout 参数 → 自动发现,不加参数

- 备选:A 参数(`--layout flat|dir`,缺省 flat)/ B 自动发现(有则随既有位置,无则报错;新建一律扁平)
- 选 B:工具跟随仓库既有约定,用户零决策;读侧 `spec show`(show.ts:142-146)已按同一口径先行,write 侧对齐后全链单口径。参数方案引入多余 CLI 面与用户心智,且与"两处并存时谁赢"的正交问题叠加后语义更糊。YAGNI:真出现需要覆盖约定的场景再补参数不迟。

## 决策 2:写入路径解析口径(与读侧单口径对齐)

1. 扁平 `llmanspec/specs/<capability>.feature` 存在 → 写扁平(两处并存扁平赢,同 show.ts);
2. 否则按 `specIdOf(entry) === capability` **精确**命中的已发现 entry(含目录式 `<cap>/<cap>.feature`)→ 写 `entry.fileName`,不做模糊解析;
3. 均未命中 → 维持 `AuthoringError("spec not found: …")`(add-* 不建新 spec)。

实现为单一 `resolveWriteTarget`,add-req/add-scenario 复用——`addScenario` 现存两 bug(目录式仓库误报 spec not found;同名扁平文件误追加)随单口径自然修复。

## 决策 3:skeleton 布局 → 永远扁平

新建 spec 一律扁平:确定性最好,llman-sdd 自身仓库即扁平;混合布局读侧(discoverSpecs 递归、nextReqId 递归)完全兼容,目录式仓库新建 capability 落扁平文件不影响校验/检索。不做"跟随仓库多数布局"启发式——待真实痛点出现再议。

## 影响面与不变量

- 改:`packages/core/src/spec/authoring.ts`(addReq/addScenario 路径解析);`apps/cli/spec.ts` 的 add-* 命令层无需改(仍传 specsRoot+entries)
- 不动:`scaffoldSpec`(skeleton 永远扁平)、`nextReqId`/`resolveReq`/`planDedupe`(已布局无关)、缺省输出面(golden 无需再生成)
- 合约:仅 `spec-authoring.feature` r41 措辞改写(扁平钉死 → 解析口径),新增目录式 @executable 验收场景挂回 r41/r42;其余 specs 零触碰

## @human 条款不可执行配对说明

r41 改写后仍为 @human 规则(校验语义:唯一性、规范语义词、写入路径口径),其行为面由既有 r41 @executable(闭环)+ 新增目录式 @executable 场景守护,无未配对缺口。
