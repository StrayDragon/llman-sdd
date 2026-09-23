# Tasks: polish-cli-followups

> 唯一剩余切片:authoring helpers 写入路径自动发现。垂直切片,每条打穿 core 函数 → BDD 步骤 → 验证。

## T1 单元:core 写入路径解析口径

- [x] `packages/core/src/spec/authoring.ts`:`addReq`/`addScenario` 改为从 `entries` 解析写入路径(扁平存在 → 扁平;否则 `specIdOf(entry) === capability` 精确命中 entry.fileName;均未命中抛 `AuthoringError("spec not found: …")`)。抽出共享的 `resolveWriteTarget(entries, specsRoot, capability, io)` 单一口径,两函数复用;顺带修复同名扁平文件误追加 bug
- [x] `tests/unit/spec.test.ts`:新增用例覆盖三分支——扁平存在写扁平、仅目录式写 `<cap>/<cap>.feature`、均不存在报错零副作用、两处并存扁平赢
- [x] 验证:`bun test tests/unit/spec.test.ts`(13 pass)

## T2 BDD:目录式布局验收场景

- [x] `tests/bdd/steps/spec-authoring.ts`:新增 given 步骤「一个目录式布局的临时 specs 目录」(搭 `<cap>/<cap>.feature`),when 复用既有 CLI 调用步骤跑 `spec add-req`/`add-scenario`,then 断言追加进目录式主文件且无扁平文件被创建、缺失时零副作用
- [x] 验证:`bun test tests/bdd`(79 pass,config.yaml `bdd.run_command`)

## T3 门禁收口

- [x] `just qa`(静态门禁 + 全部测试)全绿;golden 四门不受影响(缺省输出面零改动,预期 golden 无需再生成;若失败先判断是否为输出面回归)
- [x] 验证:`just qa` 退出码 0(283 pass;`just golden` baseline 匹配,输出面零回归)
