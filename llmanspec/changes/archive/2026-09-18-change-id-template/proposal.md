---
depends_on:
  - align-next-id-numeric
  - change-family-flags
branch: sdd/change-id-template
base_branch: main
base_sha: 81e9e709b26ed365467e33e9e65b44afd0b85278
---

# 消费 change_id 配置:pattern 校验与 template 渲染

## Why

对齐差距清单的 config 消费缺口收尾:schema 里 `change_id.pattern/template` 两字段 v2 只解析不消费;v1 中 pattern 承担 change id 合法域校验(new/validate 双入口)且加载即编译校验,template 承担数字编号型 id 的模板渲染(minijinja,Strict undefined,内置变量 llman_sdd_unique_id/verb/subject/date)。v2 已定案 nunjucks 为模板引擎,模板语义按本仓既有 TemplateEngine 适配器对齐(Lenient→渲染空 vs Strict→报错需按 v1 语义取 Strict)。

## What Changes

- `change_id.pattern` 加载即编译校验(非法正则报错);`change new` 的显式 id 与派生 id MUST 匹配 pattern,违规报错;validate(change 域)对 proposal 目录名违反 pattern 判 ERROR;缺省 pattern 宽松 kebab 兼容。
- `change_id.template` 存在时 `change new --from` 的 id 由模板渲染(nunjucks Strict:未定义变量引用报错);内置变量 llman_sdd_unique_id(全树含归档下一个空闲编号,复用 next-id 的扫描 util)/verb(--verb 或自动识别)/subject/date(YYYY-MM-DD);渲染结果仍须过 pattern。
- 新规则 r59/r60;单测 + BDD 场景;schema artifact 无变更(字段已在)。

## Capabilities

- `config-schema`(pattern 契约,@req:r59)
- `change-lifecycle`(template 渲染,@req:r60)

## Impact

- `packages/core/src/config/`(加载期编译)、`packages/core/src/change/`(new/派生链路)、`packages/core/src/validation/`(pattern ERROR);依赖 align-next-id-numeric(编号扫描)与 change-family-flags(--verb)。
