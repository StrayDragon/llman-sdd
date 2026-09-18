# Design

## 交互取舍

v1 `config skills` 交互 MultiSelect 依赖 inquire;v2 定案交互收敛 PromptDriver(ink 为战略方向,现阶段未接)。本 change 提供非交互等价物:`--set/--unset`(可重复、原子写回)+ `--json`(脚本消费)+ 默认只读列表。交互向导等 PromptDriver 落地后另行 change 补充,不阻塞命令面对齐。

## 写回机制

复用 v2 既有注释保留 upsert(`yaml` parseDocument,change frontmatter 同款):只改 `extra_skills` 列表节点,其余节点(含注释、$schema 头行)原样保留;白名单校验复用 loadConfig 的 extra_skills 枚举。

## 概览口径(对齐 v1 config 概览五要素)

`schema` / `locale` / `extra_skills (enabled/total)` / `bdd`(开:framework+run_command,关:off)/ `archive`(strict_defer/min_completion_ratio 或 default)。具体文案 apply 时对拍 v1 二进制固化。
