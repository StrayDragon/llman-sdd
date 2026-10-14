# Tasks

## 1. 域逻辑：spec id 分配与头契约

- [x] 实现 `assignSpecIds`（偏好 + 撞名消歧 + 重复终态检测）及 `rel`/`preferred` 纯函数
- [x] `discoverSpecs` 在 parse 后调用 assign；`SpecEntry` 携带 `specId`
- [x] `parseCapability` / `CapabilityHeader`：移除 capability；`# capability:` 在头注释区按普通行跳过
- [x] `specIdOf` 改读分配结果；更新 `authoring.resolveWriteTarget` 按 specId 命中
- [x] 单元测试：扁平、目录主文件、撞名消歧、终态重复 ERROR 用例

## 2. 校验与报告

- [x] `validateCapability`：删缺 capability 头 ERROR；加 `功能:` ≠ specId、分配后重复 specId ERROR
- [x] 更新 `report/specs`、`context/tree`、`show`、`unbound` 等消费方
- [x] BDD：`tests/bdd/steps/parse.ts` 等头注释与 spec id 场景

## 3. CLI 迁移与骨架

- [x] 扩展 `strip-legacy-headers` 剥除 `# capability:`
- [x] `specHelpers` skeleton 仅 `language` + `purpose`；`功能:` = 请求的 capability 参数
- [x] `migrateNotes` 注册 `0.8.1->0.9.0`（或实际发布版本）；`migrations/v0.8-v0.9/README.md`
- [x] `project migrate prompt` 手册含 strip + init --update + validate

## 4. 模板与自举

- [x] 更新 `packages/core/templates/**/feature-contract.md` 与中英 skills 头注释说明
- [x] `init --update` 刷新 `.agents/skills` 与 golden baseline
- [x] 本仓 `llmanspec/specs/**` 已剥除 `# capability:`（propose 提交）

## 5. 验证

- [x] `bun test tests/unit` 相关子集 + 定向 BDD
- [x] `llman-sdd validate --all --strict` 与 `validate --check`（apply 收尾）
