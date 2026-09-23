# Tasks

测试接缝(seam):CLI 子进程(r21/r22/r42,复用 makeTempRepo)+ core 纯函数直调(r7/r8/r5,经 @llman-sdd/core 导入),不发明新 seam。

- [x] T1: Specs landing——peripheral-commands(r21/r22)、spec-authoring(r42)、spec-parsing(r7/r8)、config-schema(r5)各配 `@req:<id> @executable` 场景,commit [blocked-by: 无]
- [x] T2: r21 步骤——show --output json 字段集、show <spec> 头注释+gherkin 原文、graph --format mermaid 契约(flowchart TD/`-`→`_`/✓ done/classDef archived),domain.ts peripheral 分节 [blocked-by: T1]
- [x] T3: r22+r42 步骤——project migrate 三态(总览/toon2features/specs-flatten 说明/未知 kind 非零)、spec add-scenario 追加成功与 req 缺失零副作用 [blocked-by: T2]
- [x] T4: r7/r8/r5 步骤——en 起步失败回退 zh-CN、locale zh-Hans→zh-CN 映射、三头注释缺失逐项报告、config 顶层字段域与未知字段宽松,core 直调 [blocked-by: T3]
- [x] T5: 门禁收口——`just qa`/`just golden`/`just pending-gate`(19→13)/`validate <id> --strict`/review 全绿;tasks 全勾,readyToImplement=true [blocked-by: T4]
  <!-- 偏差记录(2026-09-23):validate --all --strict 对 monorepo-structure 报 STALE ERROR——本批动 tests/(其 scope 覆盖 tests/),属并行批次 scope 相交固有噪声;不得改他人 spec,按 proposal 以 validate <id> --strict 与 review(rc=0)为门禁口径,不修此偏差 -->
