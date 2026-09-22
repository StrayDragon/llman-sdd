---
depends_on: []
branch: sdd/add-spec-pairing-guidance
base_branch: main
base_sha: 9ddbe471024cae32802dcfe2b46dfd09f3edc9fc
---

# spec 撰写配对引导:@human/@executable 分流判据入模板与合约

## Why

调研确认(BDD 撰写引导缺陷,2026-09-22):agent 新增的 MUST 条款多为纯 @human 文字规则、缺配对 @executable 验收——BDD-on 项目里这些条款零行为守护,且校验全绿无信号。根因在生成 skill 的模板只教语法不教分流:propose 模板 4b 节与 validation-hints unit 均未说明何时必须落 @executable,句式把 @human 设为默认主形态。本次把「前人栽树」落到合约与模板两层:撰写引导固化入 init 产物合约,杜绝回归。

## What Changes

- 模板四文件增**分流判据**:凡 GWT(假如/当/那么)可表达的自动化判定行为 MUST 落 @executable 验收场景并挂回规则;@human 仅用于无法自动化判定的人工约束(流程裁决、审美、外部事实);新增 @human 条款无可配对验收时 MUST 在 proposal/design 记录不可执行理由
  - `templates/{zh-Hans,en}/skills/llman-sdd-propose.md`(4b 单轨节)
  - `templates/{zh-Hans,en}/units/skills/validation-hints.md`(tag 语法节)
- 合约:init-generators.feature 新增 r66(@human 规则 + @executable 渲染断言),把判据存在性钉进 init 产物面;golden 基线随模板重生成(r19 既有等价门兜字节回归)
- 本仓库狗粮:`init --update` 重渲染 .agents/skills 同步新引导

## Capabilities

- init-generators(r66 条款,Specs landing)

## Impact

- 代码:仅模板 markdown 与 golden 基线,无运行时逻辑
- 不兼容变更:无——新增引导与判据,不改任何命令行为;下游 init --update 后 skills 文本变化属预期
- 明确不做:校验器侧「@human 无配对验收」信号(review 的 pending 信号已承载该计量,避免重复通道),登记于台账遗留项
