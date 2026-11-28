# 任务：嵌套下钻上下文与 DAG 深链

- [x] T1 规格：`studio-web` 增加嵌套下钻上下文、子树聚合、深链 nest/focus 规则；场景用 store/深链纯函数断言，UI 细节走 e2e。

- [x] T2 `[blocked-by: T1]` 纯函数与契约：`getSubtreeMachineIds` / 父层邻居 / 深链 parse+build；扩展 `studioFocusContextSchema`；Hub markdown/json 带 nest 与 focus 摘要。单测：环不死循环、DAG 两条路径面包屑、既有无 nest 深链不变。

- [x] T3 `[blocked-by: T2]` 前端：`jumpNestLevel` focus、嵌套门户、边界标题与 L<n>、就地预览与脏标、Prompt 子层、深链还原与分享 URL。e2e：nest=3 层打开即 L3，点门户回第 2 层并选中邻居；`focus=macro-edge` 选中该边且评论锚点为 macro-edge。`just qa`（含 qa-studio-e2e 与 conflict-run）全绿。
