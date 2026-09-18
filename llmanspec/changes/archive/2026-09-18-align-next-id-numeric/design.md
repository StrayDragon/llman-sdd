# Design

## 决策:语义回退而非兼容双轨

- 用户定案:恢复 v1 数字计数。不做 `--from` 兼容保留——同一命令双语义会让 `--json` 契约含糊(v1 的 {maxNumber,nextNumber} vs 派生结果),违背 no-compatibility 迁移策略(与 v1 拒绝旧 stage 值同理)。
- 派生预览职责移交 `change new --dry-run`(v1 同款),零信息损失。

## 全树扫描口径(对齐 v1 next_id.rs)

- 扫描 `llmanspec/changes/` 递归全部子层(含 `archive/YYYY-MM-DD-<n>-<slug>` 归档),提取目录名的前导数字段为编号;max 取全树最大,next = max+1;空树 warnings 为空、nextNumber=1。
- 人读输出两行:`max number: N` / `next free number: M`(以 v1 二进制实际输出为准,apply 时对拍固化)。

## 实现落点

- core 新增 `nextFreeNumber(io)`(注入 io,纯域);CLI next-id 改写;change new 增 --dry-run 分支(派生后直接输出,不落盘)。
