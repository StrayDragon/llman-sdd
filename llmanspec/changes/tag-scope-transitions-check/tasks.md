# Tasks: tag-scope-transitions-check

- [ ] T1: core 判定次序 tag 化并拆除配置贯通 (`@req:r104`)
  - `packages/core/src/validation/transitions.ts`：`validateTransitionsForRule` 去除 `checkTransitions` 参数；实现场景级判定次序——双 tag 冲突 ERROR → `@no-transitions` 豁免 → `@transitions` 强制纳管（残缺表交 E1 报缺列）→ 无 tag 走 `isTransitionOutline` 嗅探。
  - `packages/core/src/validation/validate.ts`、`packages/core/src/review/review.ts`、`apps/cli/src/commands/validate.ts`、`apps/cli/src/commands/review.ts`：删除 `checkTransitions` 选项与透传。
  - `tests/unit/transitions.test.ts`：按判定次序补冲突/豁免/强制/嗅探四类单测。

- [ ] T2: E4 死锁门禁语义修复 (`@req:r104`) [blocked-by: T1]
  - 无终态分支改为统一不变式"能达任一终态 ∨ 能回初始状态"；删除恒真内层 `hasPath` 与 `onlySelf && !hasIncomingFromOther && !hasOutgoingToOther` 死分支；错误消息按实际违反项表述（terminal / return-to-initial 两式）。
  - 单测覆盖：合法纯环（toggle）、吸收态陷阱（`A→B, B→B`）、单向环区（`A→B, B→C, C→B`）三类。

- [ ] T3: config 契约收缩与遗留键剥离 (`@req:r5`, `@req:r102`)
  - `packages/core/src/config/schema.ts` 删除 `check_transitions` 字段；loader 将 `specs.check_transitions` 识别为已移除键：宽松剥离 + stderr WARNING（指引改用 `@transitions`/`@no-transitions`）。
  - 本仓 `llmanspec/config.yaml` 去除该键；`bun run gen:schema` 再生 artifact，`bun run check:schema` 绿。
  - `tests/unit/config.test.ts` 与 `tests/bdd/steps/config.ts` 更新 r102 场景绑定（true/false/未设置 → 剥离 + WARNING；非布尔 → 遗留键同径剥离不再报字段类型错）。

- [ ] T4: `spec transitions` 只读内省子命令 (`@req:r105`) [blocked-by: T1]
  - core 导出单一事实源常量（特征词别名集、发现判据、tag 语义、E1–E4 门禁文案）；`apps/cli/src/commands/spec.ts` 注册 `transitions` 子命令渲染之。
  - BDD 场景断言输出含特征词族、双 tag 名与四门禁标识。

- [ ] T5: specs BDD 步骤绑定与全量门禁收口 [blocked-by: T1, T2, T3, T4]
  - `tests/bdd/steps/validation.ts` 重写 r104 新场景步骤（tag 定界四分支 + E4 两式消息）；`tests/bdd/steps/spec-authoring.ts` 或 peripheral 域补 r105 步骤。
  - 本 change 分支上 `just qa` 全绿（含 `validate --all --strict --check`）。

- [ ] T6: 迁移文档追加 [blocked-by: T1, T3]
  - `migrations/v0.8-v0.9/README.md` 增节：`check_transitions` 移除与嗅探缺省启用的升级路径（删键或保留即剥离、误伤场景加 `@no-transitions`）。
