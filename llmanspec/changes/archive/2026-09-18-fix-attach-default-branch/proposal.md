---
depends_on: []
branch: sdd/fix-attach-default-branch
base_branch: main
base_sha: b881a4acf6afc309aed4d608089073a77299505f
---

# change attach 补默认分支门禁

## Why

双二进制对拍实证:v1 `change attach` 在默认分支上明确报错(`changes must not attach on the default branch (main); create/switch to a feature branch first`),v2 却成功把 change 绑到 `main`(对齐差距清单 P0-2)。绑定到默认分支会使 `change diff`/`finalize` 的 base 语义失真,且与 `change start` 的分支门(r14)不一致,是正确性缺口。

## What Changes

- `change attach` 在当前分支为默认分支时 MUST 报错且不写任何绑定(错误文案对齐 v1 语义:提示先建/切 feature 分支或用 change start)。
- detached HEAD 报错行为保留(现状),一并纳入合约。
- 补单测(默认分支拒绝、feature 分支通过、detached 拒绝)与 `@executable` BDD 场景(先红后绿)。

## Capabilities

- `change-lifecycle`(attach 分支门合同,新增 @req:r31 规则)

## Impact

- `packages/core/src/change/lifecycle.ts`(attach 门)+ CLI 错误路径;不影响 start/finalize。
- 既有 attach 合法路径行为不变;v2 现网若有"绑在默认分支"的存量绑定不受影响(只拦新绑定)。
