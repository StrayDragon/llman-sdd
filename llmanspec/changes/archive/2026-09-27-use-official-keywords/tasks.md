# Tasks

测试边界(seam):复用既有 harness——单测 seam 为 core 纯函数(officialKeywords/migrateNativeSource/addReq/addScenario/skeletonContent),BDD seam 为 steps/parse.ts 既有模式,不引入新 seam。

- [x] t1: 新增 packages/core/src/spec/keywords.ts:`officialKeywords(language)` 从官方词表(@cucumber/gherkin dialects)确定性选取 feature/rule/scenario/given/when/then(en/zh-CN 合约关键字逐字锁定并运行时校验官方表成员;其余方言过滤 `* ` 星号步、trim 取首个;无表语言返回 null),barrel 导出;tests/unit/keywords.test.ts 断言 zh-CN/en/fr 选取结果、全方言「选取词 ∈ 官方表」属性、星号步排除、en 尾随空格 trim、unknown → null
- [x] t2: [blocked-by: t1] 三处发射点收敛:migrateNative 关键字表、authoring keywordsOf(`# language:` 头优先)与块边界正则(官方词表动态构建)、skeletonContent(locale 透传 + en 步骤修复);parser/runner 的 step kind 分类同源收敛(官方全方言表);单测补 fr 迁移 roundtrip、en skeleton 回归(无中文关键字)、fr skeleton(官方 fr 词表且可解析)、fr 文件 add-req/add-scenario 追加;现有 en/zh 用例零漂移(276/276)
- [x] t3: [blocked-by: t2] specs 落地:r88 措辞泛化(官方词表来源)、r41/r42 关键字口径泛化、r7 en skeleton 场景补正文断言 + fr skeleton 分支、r88 新增 fr 迁移可执行场景;tests/bdd/steps/parse.ts 绑定新步骤;`bun test tests/bdd` 通过且 `just qa` 全绿
