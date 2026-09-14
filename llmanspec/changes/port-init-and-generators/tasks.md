# Tasks

测试边界(seam):`packages/core` 模板引擎与 init 编排(单元 + `@executable` BDD 临时目录产物断言)+ golden 归一化 diff(v1 ↔ v2 生成物)。

- [ ] T1 引擎:nunjucks 适配器(autoescape off、Lenient、unit 递归 cap 32、trim_end)+ locale 链 + 单元测试
- [ ] T2 资产:模板双树搬运(en/zh-Hans/shared)+ 变量集(buildTemplateVars)+ 单元测试
- [ ] T3 init 编排:脚手架 + AGENTS.md 托管块 + skills 渲染/ethics 门/命名空间清理 + 单元测试
- [ ] T4 CLI:`init [--update]` 子命令
- [ ] T5 golden:v2 通道接入 check.ts(版本归一化 diff 为空)+ BDD `@executable` 产物断言
