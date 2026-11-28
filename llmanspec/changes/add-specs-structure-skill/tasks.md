# Tasks

> 验收 seam：① 渲染产物与 golden 归一化 diff 为空且 ethics 门通过；② 新技能引用的每个 CLI 命令/旗标可在 `--help` 找到；③ onboard 示例语法可被 `studio validate --specs` 接受；④ research 每条断言有 URL+日期。

- [ ] T1 规格：`init-generators` 增加 specs-structure 技能模板与基线同步规则；BDD 场景断言渲染产物含判定表、真实命令面与 ethics 键。

- [ ] T2 `[blocked-by: T1]` 新增 `llman-sdd-specs-structure` 模板并修订 onboard/collab；登记 `OPTIONAL_SKILL_FILES` 与 stc 基线；`init --update` 刷新 `.agents/skills/` 与 golden。onboard 示例放入临时规格跑 `studio validate --specs`。调研写入 `research/agent-surfaces.md`。
