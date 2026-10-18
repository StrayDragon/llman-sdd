## 单轨 Feature 合约规范

每个 capability 只有一个 Gherkin 文件：扁平 `llmanspec/specs/<capability>.feature`（默认）或目录 `llmanspec/specs/<capability>/` 内同名主文件——二选一，同 id 两布局并存算冲突。它是唯一的 spec 工件（不存在 `spec.toon`）。

- capability 即 discover 在实例内从路径分配后的 spec id，`功能:` 标题必须等于该 id；不得要求或生成 `# capability:` 头。
- 头注释 `# language:`（方言）必填：缺失则解析器回退默认方言，条款可能按错误方言解析。
- 覆盖分级：enforced（`规则:` 含嵌套 `场景:`）/ pending（裸 `规则:`）——`list --specs` 逐项输出；pending 由聚合计数与 specs-compact 承担压降。
- 缩进层级两空格递进：块 `规则:` 2 格、嵌套 `场景:` 4 格、步骤 6 格。
