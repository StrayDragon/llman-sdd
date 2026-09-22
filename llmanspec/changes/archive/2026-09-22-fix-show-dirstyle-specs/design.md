# Design: 修复 show 对目录式 specs 的解析缺陷

## 决策 1:isSpec 判定三子句 OR，保留既有语义

`options.type === 'spec' || existsSync(扁平) || entry 精确命中`。扁平子句原样保留（扁平仓库零漂移）；entry 命中口径 `(capability ?? fileName 去 .feature) === item`，与 `renderSpecJson`/`collectSpecs` 完全一致。副作用：`--type change` + spec id 的「文件存在即覆盖 type hint」quirk 从仅扁平扩展到目录式——两布局行为均一化，优于维持一半有一半无。

## 决策 2:路径解析优先扁平

进入 spec 分支后：扁平路径存在 → 读扁平；否则读 `join('llmanspec/specs', entry.fileName)`（entry.fileName 为相对 specs 根的路径，目录式为 `<cap>/<cap>.feature`）。entry 未定义且扁平不存在 → 维持 `spec not found: <item>` 单行报错 exit 1（`--type spec` 强制不存在项的既有行为不变）。

## 权衡

- 备选「show 全走 resolveChangeId 式前缀链」被否：r25 钉死 spec id 精确匹配优先且不被 change 前缀劫持，spec 侧维持精确匹配即可。
- authoring helpers（add-req/add-scenario 的 `${specsRoot}/${capability}.feature` 写路径）有同病但涉及写路径约定（目录式该写到哪、骨架生成器如何定布局），超出缺陷修复边界，记录为已知残留另行 change。
