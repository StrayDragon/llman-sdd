# Tasks

测试边界(seam):`packages/core` 公共函数(loadConfig / parseCapability / buildReqRegistry)经 bun:test 单元 + `llmanspec/specs/*.feature` 的 `@executable` 场景(BDD runner 驱动真实 API)双通道验证。

- [ ] T1 config:zod schema(逐字段对齐 v1)+ `loadConfig`(yaml 解析 + 校验,错误截前 5 条)+ 单元测试
- [ ] T2 schema artifact [blocked-by: T1]:`scripts/gen-schema.ts`(zod-to-json-schema,`--check` 漂移门)+ 产物入库
- [ ] T3 gherkin 语义层 [blocked-by: T1]:解析链(header → en → zh-CN)+ 头注释解析 + tag 分层语义 + `localeToGherkinLang` + IR 类型 + 单元测试
- [ ] T4 rN 注册表 [blocked-by: T3]:多文件扫描 + 全局唯一性报告 + 单元测试
- [ ] T5 BDD 接线 [blocked-by: T1, T3]:root 依赖 `@llman-sdd/core`、run.test.ts 扫 `llmanspec/specs/*.feature` 的 `@executable` 场景、`tests/bdd/steps/domain.ts` 领域步骤;两条 capability specs 各含可执行场景并全绿
