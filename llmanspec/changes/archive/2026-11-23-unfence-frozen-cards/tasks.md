# 任务：冻结卡归一

测试边界（seam）：复用既有边界——core 纯函数用 `tests/unit/` 直接导入；CLI 动作、`freeze`/`thaw`
走 `tests/bdd/`（CLI 子进程 + 临时仓库）；门禁对账在 `tests/bdd/assert/quality-gates.ts`。

- [x] T1: `packages/core/src/archive/frozenCard.ts` 新增 `unfenceFrozenCard(source): string | null`，按设计的四条判定实现（首末行精确匹配、去围栏后单文档可解析、键集受控）；`packages/core/src/index.ts` 导出
- [x] T2: `tests/unit/frozen-card.test.ts` 覆盖归一正例与全部跳过分支：围栏卡归一、无围栏卡返回 null、正文含 `---` 的卡不被误改、去围栏后非单文档返回 null、键集越界返回 null、幂等（对结果再跑一次仍返回 null）
- [x] T3: `packages/core/src/archive/freeze.ts` 的 `runThaw` 在删卡循环里顺带归一仍存在的围栏卡，失败只记 WARNING 不阻断回置 [blocked-by: T1]
- [x] T4: `apps/cli/src/commands/project.ts` 新增 `frozen-cards-unfence` 动作（`--dry-run` 只报告），复用实例根发现与 `ARCHIVE_DIR_REL`；unknown action 错误消息的期望动作列表同步 [blocked-by: T1]
- [x] T5: `tests/bdd/steps/` 补可执行场景：归一动作 dry-run 零写入、真实执行后围栏卡消失且 `parseDeps` 等值、对无围栏卡幂等；thaw 顺带归一场景 [blocked-by: T3, T4]
- [x] T6: 规格措辞更新：`review-freeze.feature` 明确写侧只产无围栏 + 归一动作存在；`peripheral-commands.feature` 把「不迁移」改为「读取兼容 + 归一入口」 [blocked-by: T5]
- [x] T7: 迁移登记表新增版本条目（说明升级后跑归一动作），同步 `tests/unit/migrate-prompt.test.ts` 的版本清单断言；`migrations/` 下补手册段 [blocked-by: T6]
- [x] T8: 本仓库 50 张围栏卡执行归一；`.pre-commit-config.yaml` 收回单条 `check-yaml`；`tests/bdd/assert/quality-gates.ts` 断言同步为单条目 [blocked-by: T4]
- [x] T9: `llman-sdd init --update` 刷新 skills，全量 `just qa` 与 `prek run --all-files` 在 change 分支上全绿 [blocked-by: T2, T5, T7, T8]
