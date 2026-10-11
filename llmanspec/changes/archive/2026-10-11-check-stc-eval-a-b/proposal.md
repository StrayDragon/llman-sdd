---
depends_on: []
branch: sdd/check-stc-eval-a-b
base_branch: main
base_sha: da869ff81a5b5b4b8fb49a67745750db78f3b20b
---

## 模板中文文风治理：强度词统一、check-stc 门禁与 eval A/B

## Why

模板 skills（zh-Hans）的指令文风存在三类可程序判定的漂移，直接作用于 agent 阅读与遵循：

1. **强度词混用**：同一 skill 内 `MUST / 必须 / 禁止 / 不要 / 勿 / 建议 / 优先` 并存（zh-Hans 模板 I1 类错误 60+ 处），模型无法从形态推断权重排序。
2. **行话与模糊量词**：`落地 / 闭环 / 链路 / 相关 / 必要时`（G6/G5 类 20+ 处），语义要二次翻译。
3. **无回归门**：文风漂移无门禁，随每次模板编辑回潮（本轮 PoC 前普查 216 错）。

STC（Simplified Technical Chinese，`@daimonia/stc` 0.2.1）提供可执行检查器与本仓治理目标一致，取其检查器与词表作 lint 层；语义正确性仍由既有门（template-guidance-parity / template-command-parity / golden 渲染门）独立守护，两套门互不覆盖。

## What Changes

- **强度词边界（定案）**：同一语言内强度词汇表唯一，跨语言不互译——zh-Hans 模板正文只用 `必须/不得/宜/不宜/可/不必/能/不能`（STC I1 四级，GB/T 1.1—2020 结构），en 模板只用 `MUST/MUST NOT/SHOULD/SHOULD NOT/MAY`（RFC 2119）；例外仅「引用 spec 合约原文」（如 "specs 的 MUST/SHALL 逐条落实"）保留被引对象词汇。zh 模板步骤句允许祈使式（I1 豁免）。
- **zh-Hans 模板全量文风修订**：I1 强度归一、G6 行话替换（落地→提交/闭环→定义后用循环/链路→调用路径）、G5 模糊量词具体化（相关→匹配 `<paths>` 的）、G17 `「」`→`“”`、G4 名词化动词化、G9/G12 长句拆分、G20 自证括号清理；en 模板同步语义（r70 双 locale 同语义约束）。
- **check-stc 门禁**：`scripts/check-stc.ts` 对 `packages/core/templates/zh-Hans` 逐文件跑 `stc check --profile for-instruction-writing --json`，对照 `scripts/stc-baseline.json` per-file 错误上限（只许下调，同 pending-gate 治理）；挂进 justfile `qa` / package.json `qa` / ci.yml / `tests/bdd/assert/quality-gates.ts` 对账面（r2 联动，见 Tasks）。
- **zh 模板 MUST 边界断言**：`template-guidance-parity.test.ts` 增补——zh-Hans 模板禁裸 `MUST|SHALL`（引用例外白名单）、en 模板禁 `必须|不得`。
- **eval A/B**：`eval` 面新增 skill 文风断言 `skill_style`（纯 Python 查四级词表外强度词计数与 `「」`计数，随 rewardkit 面板呈现）；A/B 经 `groups.yaml` 双 group（stable=现模板基线 worktree / stc=本 change 分支 worktree）各 `n_attempts: 3` 对比 reward 现状，不改 reward 聚合语义。runner 侧 API 配置变更（OPENAI_BASE_URL 等）不在本 change 范围，遇到再处理。

## Capabilities

- `specs/init-generators`：模板文风合约（强度词边界、zh 模板词汇面）与 check-stc 门禁挂钩。
- `specs/monorepo-structure`：qa 门集合扩一项 `check:stc`（r2 对账三处一致性联动）。
- `specs/eval-playbook`：skill 文风断言与 A/B 对比约定（不改 reward 聚合）。

## Impact

- `packages/core/templates/{zh-Hans,en}/**`（全量文风修订）→ 渲染产物 `.agents/skills/**` 与 `tests/golden/baseline/**` 随 `init --update` 刷新（工程规则既有要求）。
- `package.json` 新增 devDependency `@daimonia/stc`（方案 a，版本钉 ^0.2.1）与 `check:stc` script；`justfile` qa recipe 加一行；`.github/workflows/ci.yml` test job 加一步；`tests/bdd/assert/quality-gates.ts` 对账集合同步——四处一起改，否则 r2 对账门红。
- `tests/unit/template-guidance-parity.test.ts` 增补 MUST 边界断言。
- `eval/tasks/playbook/tests/skill_style/check.py` 新增；`eval` 零 runner 改动。
- 不改 CLI 行为、不改 specs 解析、不改 reward 聚合；`stc-disable-next-line` 为显式豁免通道（误报时行上注释+理由，不迁就句子）。
