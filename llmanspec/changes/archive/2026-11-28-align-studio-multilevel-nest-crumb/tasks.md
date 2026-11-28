# 多级贴框面包屑 — 任务

> 验收 Seam：① `nestFrameCrumbItems` 纯函数单测；② `studio-web` r176 新场景 BDD；③ nest e2e 三层时 crumb 步数 ≥3。前后对比在 change 分支上相对 merge-base 测量。

- [x] T1 `nestFrameCrumbItems` / 层级文案纯函数与单测。
- [x] T2 `[blocked-by: T1]` 边界框渲染全路径；返回上层不拼接父名；祖先可跳。
- [x] T3 `[blocked-by: T2]` 扩展 r176 场景与 BDD；e2e 断言多层 `data-nest-step`。
