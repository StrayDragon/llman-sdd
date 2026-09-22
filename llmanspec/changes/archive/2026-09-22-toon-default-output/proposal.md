---
depends_on:
  - filter-info-issues-by-default
branch: sdd/toon-default-output
base_branch: main
base_sha: 866a0e61da76f758af63829d351c772c2a3daf43
---

# 报告型命令缺省 TOON 输出与 --output 统一

## Why

渲染层地基(C1)已让 json/compact-json/toon 从同一 IR 产出,INFO 过滤(C2)已砍掉最大噪音源。本变更完成最后一步:报告型命令的缺省输出从人读文本翻转为 TOON——LLM/agent 是本 CLI 的第一消费方(项目定位),TOON 相对 pretty JSON 省 ~40% token 且结构护栏([N]{fields})防截断,人与 agent 首次共用同一缺省输出。这是对「v1 输出对齐口径(2026-09 定案)」的主动、有界破约:`--json`/`--compact-json` 别名面与退出码保持 v1 字节不变,v1 parity 收窄为别名面 parity。

## What Changes

- flag 面:报告型命令(review/validate/list/show/config skills/index check)统一 `--output <toon|json|compact-json|human>`;兼容别名 `--json`/`--compact-json` 行为字节不变(v1 parity 面);`--output human` 是旧人读文本唯一入口
- 缺省翻转:无 flag 时上述六命令输出 TOON(IR 与 --json 同载荷);退出码语义全部不变
- show 的既有 output tokens(json/compact/meta-only/no-scenarios)保留并新增 toon/human;缺省从人读文本翻转为 toon
- index check 新增机器出口(IR {fresh, notes}),缺省 toon;`--output human` 保留原文本
- 元规范:llmanspec/AGENTS.md「输出对齐口径」定案改写(v1 parity = 别名面+退出码)+ 技术栈节登记 @toon-format/toon(C1 遗留)
- 合约:review-freeze/validation/peripheral-commands/config-command/context-index 相应条款重写(Specs landing);migrations/v0.3-v0.4/ 下游迁移指引;CHANGELOG BREAKING
- 明确不动:change 生命周期、init、spec \*、project \*、graph(缺省 mermaid)、context(恒机器格式,toon 化归后续)、--export-html

## Capabilities

- review-freeze / validation / peripheral-commands / config-command / context-index(条款重写)

## Impact

- 代码:apps/cli/src/main.ts(六命令 flag 与缺省)、packages/core(无——渲染器已在 C1 就绪)
- 测试:integration(show-dirstyle 缺省断言改挂 --output human)、BDD r47 文本断言补 --output human、unit 不动(core 层无缺省概念)
- 破坏性:缺省输出形态变更——下游 grep 缺省文本的脚本需迁移(migrations 指引 + --output human 兜底);版本策略 0.4.0(CHANGELOG Unreleased 记 BREAKING,版本号随发布流程)
