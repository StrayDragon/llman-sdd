# Tasks — unify-init-locale-precedence

测试 seam（既有 harness，不新造边界）：

- 单元：`tests/unit/init.test.ts`（runInit/updateFileWithMarkers）、`tests/unit/config.test.ts`（loadConfigDetail）
- BDD：`tests/bdd/steps/init.ts`（`runInit` 单元级 + `runCli` 子进程级，绑定 init-generators 场景）

## T1 locale 优先级链与缺键告警

`loadConfigDetail` 暴露 locale 键显式存在性（design D1 方案 A）→ core 新增 `resolveEffectiveLocale` 纯函数并接入 `runInit`（`onWarning` 注入通道，design D2/D3）→ CLI init 透出 stderr 告警并更新 `--locale` help 文案（优先级链语义）→ 单测覆盖链路三分支（config 显式 / 缺键+选项 / 缺键+内置）与缺键告警 → `tests/bdd/steps/init.ts` 绑定 r50 新场景（update 时选项被 config 压制、缺键时选项生效）。

- [x] T1 完成，`bun test tests/unit/init.test.ts tests/unit/config.test.ts tests/bdd` 全绿

## T2 per-workspace 刷新扫描与新建实例告警

`[blocked-by: T1]`（同文件 `apps/cli/src/commands/init.ts`，串行避免冲突）→ 移除 `--update` 块扫描的 `repoRootInstance` 门控（design D5）→ 目标根非实例且祖先存在实例时经 `resolveInstanceRoot` 输出告警（design D4）→ 单测：子根 `--update` 刷新兄弟/后代实例托管块、skills 仍仅仓库根注入/清理 → BDD 场景：新建实例告警 + per-workspace 刷新。

- [x] T2 完成，`bun test tests/unit/init.test.ts tests/bdd` 全绿
