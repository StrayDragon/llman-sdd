# Tasks

垂直切片,每片打穿 core→CLI→测试一条窄路径;`[blocked-by]` 标依赖。

- [ ] T1 core 注册表 per-version 化与范围解析
  重写 `packages/core/src/project/migrations.ts`:`MigrationDoc { version, items[] }` 注册
  表(0.8.0 承接治理元数据退役;0.9.0 聚合 r101 头/id、check_transitions 移除、init
  locale/update 三条目);`parseVersion`/`compareVersion` 数值比较;`resolveMigrations(from, to)`
  按 `(from, to]` 升序聚合;`migrationPrompt(from, to, docs)` 按设计 D4 渲染(版本头/
  条目/Steps/清单/`---` 分割线),空范围渲染为无登记迁移提示;`migrationOverviewLines`
  改列版本。core `index.ts` 导出新面,移除 pair 旧导出。单测重写 `tests/unit/migrate-prompt.test.ts`:
  聚合正确性(0.8.2->0.9.0 含 0.9.0 三条目、不含 0.8.0)、空范围、非法版本/逆序、渲染
  确定性。seam: `@llman-sdd/core` 公共导出。
- [ ] T2 CLI 旗标面与废弃 WARNING `[blocked-by: T1]`
  `apps/cli/src/commands/project.ts`:`--from-version`/`--to-version` 两旗标(必填校验、
  非法格式与 from>=to 报错);`--version-expr` 保留解析、stderr 弃用 WARNING、与新旗标
  同给报冲突;prompt 无选择旗标时的 usage 提示改新写法;`strip-legacy-headers` 组合拒绝
  覆盖三类旗标。BDD:重写 `tests/bdd/steps/migrate-scope.ts` r100 prompt 步骤并绑定新
  场景(范围聚合输出、空范围退出码 0、非法输入报错、废弃 WARNING)。seam: CLI 子进程。
- [ ] T3 迁移指导同步 `[blocked-by: T1]`
  `migrations/v0.8-v0.9/README.md` 迁移 1 升级步骤示例改 `--from-version 0.8.x
  --to-version 0.9.0` 写法;通读仓库内其余 `--version-expr` 活引用(排除历史
  release-notes 与归档 change 文档)确认零残留。验收:grep `version-expr` 仅命中历史
  文档与废弃实现内的兼容代码。
