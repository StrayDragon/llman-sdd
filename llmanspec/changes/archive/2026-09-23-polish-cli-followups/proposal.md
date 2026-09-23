---
depends_on: []
needs_specs_change: true
branch: sdd/polish-cli-followups
base_branch: main
base_sha: 256af30bb1c6cdaa569aa24f0ee67cec621344c0
---

# CLI 体验收尾杂项(draft 防遗忘)

## Why

TOON 缺省化程序(toon-default-output,已归档)收官时登记的三项低优先级收尾,单独立此 draft 防遗忘;各项均小,可合并一个 change 或按需拆分。当前仅记录意图,排期后补 design/tasks 再实施。

## What Changes

- **authoring helpers 目录式支持**:`spec add-req`/`add-scenario`(`packages/core/src/spec/authoring.ts:96/:124`)仍按扁平 `specs/<cap>.feature` 硬拼写入路径,目录式仓库写入落空;且 add-scenario 存在误报(req 在 entries 中可寻得却报 spec not found)与同名扁平文件误追加两个现 bug。**方案定向(2026-09-23 定案,自动发现,不加 --layout 参数)**:
  - 写入路径解析口径(与 `spec show` 读侧 show.ts:142-146 现行先例单口径对齐):① 扁平 `specs/<cap>.feature` 存在 → 写扁平(两处并存扁平赢);② 否则按 `specIdOf(entry) === capability` 精确命中的已发现 spec entry(含目录式 `<cap>/<cap>.feature`)写之,不做模糊解析;③ 均未命中维持 `spec not found` 报错(add-* 不建新 spec)
  - 复用 `discoverSpecs` entries(`addReq`/`addScenario` 已接收 entries 参数,仅改为参与路径解析);`nextReqId`/`resolveReq`/`planDedupe` 已布局无关,不动
  - **skeleton(`scaffoldSpec`)保持永远扁平**:新建 spec 一律扁平,确定性最好;混合布局读侧(discoverSpecs 递归)完全兼容,无需跟随仓库启发式
  - **合约约束**:`spec-authoring.feature` r41(@human)把扁平写入路径钉进合约 → 本项走完整 SDD(本提案),Specs landing 改 spec-authoring:r41 措辞改为上述解析口径,并新增目录式布局的 @executable 验收场景挂回 r41/r42;r42 本身路径无关无需改写
- **context toon 化**:**明确不做(2026-09-23 定案)**。`context-index.feature` 把 stdout 嵌套 JSON 结构钉进 MUST 条款(status/direct/related/summary 全链),改 TOON = 合约重写;而 context 是纯 agent 命令,agent 消费 JSON 无损耗,面收益为零。重启条件:context 未来转为人读排障为主再议
- **--type 帮助文案统一**:✅ 已完成(2026-09-23 quick 清理)——show 侧改为与 validate 一致的 `force disambiguation: change | spec`;两命令语义核实相同(均覆盖自动消歧),差异仅原文案措辞
- **onboard/show 两个孤儿 skill 模板(2026-09-23 复核登记)**:✅ 已删除(2026-09-23,用户拍板"移除,含其他 skills 对齐引用")——全仓引用检索仅命中测试内无关 tmpdir 前缀;golden 与 .agents 狗粮不涉

## Capabilities

- spec-authoring(add-req/add-scenario 写入路径解析口径,r41)
- peripheral-commands(--type 文案,已完成项的归属记录)

## Impact

- 剩余仅 authoring helpers 一项,走完整 SDD;--type 已完成,context toon 化已定案不做;不触碰缺省输出面(0.4.0 已定案);无迁移需求(目录式仓库此前写入直接报错,不存在错误数据需要迁移)
- 测试 seam(复用既有 harness):单元 `tests/unit/spec.test.ts`(addReq/addScenario 公共函数路径解析)+ BDD `tests/bdd/steps/spec-authoring.ts`(目录式临时 specs 目录的新 given 步骤)
