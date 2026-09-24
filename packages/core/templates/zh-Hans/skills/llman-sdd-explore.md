---
name: "llman-sdd-explore"
description: "探索模式：理清思路、调查需求、分析问题；只思考不写代码。意图不明或需先分析再行动时用。"
metadata:
  version: "{{ llman_version }}"
---

# LLMAN SDD Explore

在开始实现前理清思路、调查问题、澄清需求时用此 skill。

**探索模式只思考，不实现：**
- 可以读文件、搜代码、调查代码库。
- 可以建/改规划文档（proposal/design/tasks）。
- `llmanspec/specs/**` **只读**——除非 change 已绑定分支且你在该分支上；否则 STOP 并建议 `llman-sdd-propose` / `change start`。
- 禁止写应用代码。

## Pipeline 位置

{{ unit("skills/git-native-flow-brief") }}

```mermaid
flowchart LR
    explore["★ llman-sdd-explore"] --> propose["llman-sdd-propose"]
    propose --> apply["llman-sdd-apply"]
    apply --> verify["llman-sdd-verify"]
    verify --> archive["llman-sdd-archive"]

    style explore fill:#fff3cd,stroke:#ffc107,stroke-width:3px
```

> 📍 你在探索阶段 → 下一步通常 `llman-sdd-propose`；小改动（不改合约）走 `llman-sdd-quick`。

## 姿态
- 好奇而不教条，以真实代码为依据。
- 需要时用 ASCII 图可视化；同时保留多个选项与权衡。

## 建议动作
1. 用 `llman-sdd context --task "<任务>" --paths "<文件>"` 定位相关 specs，通读其 `direct` 列出的 spec 全文（这些是必须理解的合约）。
   - context 不可用 → 先 `llman-sdd index check`：stale/缺失则 `llman-sdd index rebuild`（默认 pageindex，免模型）后重试；fresh 仍不可用（`LLMAN_SDD_INDEX_CHAT_MODEL` 未设）→ 改用 `llman-sdd list --specs` + 直读 `.feature`——勿循环 rebuild。
2. 澄清目标与约束（问 1–3 个问题）。
3. **逐问深挖分支（可选，用户显式触发才进入）**：触发词「深挖」「grill」「逐个问」「彻底理清」。进入后一问一答走清决策：
   - 一次只问一个问题，附你的推荐答案，等反馈再问下一个。
   - 事实 vs 决策分离：能读 `.feature`/代码/跑命令查证的事实自行查证，**不问**用户；只有决策（取舍、偏好、范围边界）才问。
   - 术语校准：术语冲突或模糊立即指出（「spec 定义 'X' 为 A，你刚说成 B——哪个对？」）；解决后：已绑定分支且当前在绑定分支上 → 更新 `.feature`；否则只记入 `proposal.md`，禁止在默认分支改 specs。MUST NOT 另建 `CONTEXT.md` 词表当第二权威。
   - 决策回写：已解决的决策写进该 change 的 `proposal.md`「Open Questions」段。
   - 完成判据：每个待定决策都已解决或显式推迟。未触发时保持默认（问 1–3 个问题）。
4. 涉及某个 change id 时，读 `llmanspec/changes/<id>/` 下的工件。
   - 诊断校验错误先跑 `llman-sdd validate <spec> --strict` 过结构门禁（Gherkin / `@req` 链接 / 双写 / req_id 唯一性）；配置了 `bdd.run_command` 时 validate 缺省执行该 harness（`--no-check` 跳过）。失败项在缺省 TOON 输出的 `items[].issues[]` 逐条指明；`--output human` 输出人读 `FAIL <item_type>/<id>` 行。
5. 探索 2–3 个选项与权衡。
6. 判断变更规模，确定是否走完整 SDD。
7. 结论清晰时建议用户记录（勿自动写）：
   - 范围/设计/工作项 → 规划文档（`proposal.md` / `design.md` / `tasks.md`）
   - 约束/可执行 harness → **仅建议**写入 `llmanspec/specs/**`；实际编辑须先绑定分支。未绑定时只记 proposal。

## 退出探索模式
- 行为合约变更 → `llman-sdd-propose`
- 小改动 / 不改合约 → `llman-sdd-quick`
- change 已落地 specs（`stage=full`、specs-landed 门绿）→ `llman-sdd-apply`
若用户在探索中要求开始实现，STOP 并提醒先退出探索模式。

{{ unit("skills/cli-footer") }}

{{ unit("skills/structured-protocol") }}
