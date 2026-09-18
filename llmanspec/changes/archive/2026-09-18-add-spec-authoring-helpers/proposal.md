---
depends_on: []
branch: sdd/add-spec-authoring-helpers
base_branch: main
base_sha: a148053e5270391436a07ff6822eb5b81103d80b
---

# 补齐 spec 编程式 authoring 助手与 req 注册表去重

## Why

双二进制对拍实证:v1 spec 助手五件套中 v2 只有 skeleton/next-req-id,缺 `spec add-req`(别名 add-requirement)、`spec add-scenario`、`spec resolve-req` 与 `project dedupe-req-ids`——编程式追加规则/验收场景与 rN 冲突治理全靠手编 .feature,易破坏全局 rN 唯一性与 MUST 语义词约定(对齐差距清单-缺失命令,无移除定案,判定为遗漏)。

## What Changes

- `spec add-req <capability> <req_id> --title <T> --statement <S>`(别名 add-requirement):校验 req_id 全局唯一 + statement 含规范语义词,向目标 .feature 追加 `@req:<id> @human` 规则场景后写盘。
- `spec add-scenario <capability> <req_id> <scenario_id> --when <W> --then <T> [--given <G>]`:向目标 req 追加 `@req:<req_id> @executable` 验收场景;req 不存在报错。
- `spec resolve-req <req_id>`:反查输出 capability 与 statement,未命中报错。
- `project dedupe-req-ids [--dry-run]`:扫描主库冲突 rN,重映射为空闲短 id;dry-run 仅报告映射计划。
- 新 capability `spec-authoring`;补单测与 BDD 场景。

## Capabilities

- `spec-authoring`(新 capability:@req:r41-r43)

## Impact

- `apps/cli/src/main.ts`(命令注册)+ `packages/core/src/spec/`(注册表复用 buildReqRegistry,追加用文本级写入避免重排既有内容);spec-parsing 既有合约不变。
