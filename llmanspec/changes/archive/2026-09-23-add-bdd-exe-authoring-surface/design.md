# Design: BDD executable 化·MEDIUM 批

## 决策 1:步骤全量落 tests/bdd/steps/domain.ts,seam 按条分层

r21/r22/r42 走 CLI 子进程(输出合同属 CLI 面),复用 `makeTempRepo` fixture 与既有全局步骤;`show --output json` 字段集断言新增专用 then 步骤(peripheral 分节)。r7/r8/r5 直调 core 纯函数(`parseFeatureSource`/`parseCapability`/`loadConfig`,经 `@llman-sdd/core` 导入,同 domain.ts 既有模式)。不发明新 seam。

## 决策 2:合同断言钉形状不钉快照

r21 断言字段集覆盖与 graph 契约(`flowchart TD` 开头/`-`→`_`/`✓ done`/`classDef archived` 收尾),不锁全文——文案迭代自由;字节级回归由单测与 golden 兜底。r22 场景写准 migrate 三态(裸调用总览、两种 --kind 协作说明、未知 kind 非零退出)。

## 决策 3:无行为变更,不改 packages

parser/config/writer 合约均已由邻近单测覆盖;本批纯验收接线,packages/ 与 apps/cli 源码零改动。

## 权衡

- 备选「r21 全部走仓库真实工作区」被否:字段集断言需要稳定 change 集合,临时仓库不受并行批次干扰。
- 备选「为 migrate 三态各开独立场景」被否:三态共享一个 fixture,单场景多 then 更贴合 v1 pending 口径(一条规则一条验收)。

## 已知偏差(预先登记)

`validate --all --strict` 可能因 monorepo-structure 的 STALE 报 ERROR——本批动 tests/(其 scope 覆盖 tests/),属并行批次 scope 相交的固有噪声;不得改他人 spec,以 `validate <id> --strict` 与 review 为准。
