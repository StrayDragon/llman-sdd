# 多级贴框面包屑

demo（`studio-demo.html` nest-frame-crumb）：`返回上层` + `nestStack.forEach` 全路径，当前项 `.current`，末尾 `L${length}`。demo 第一次下钻会把当前机推进 stack，故路径含根机。

本仓 `nestStack` 不含 Tab 根，已有 `nestBreadcrumb(tabRoot, nestStack)` 补根。贴框改渲染该列表：

```
[返回上层] | [根] › [L2] › [当前 L3]
```

- 返回上层 → `jumpNestLevel(len-2, hostUid)`
- 祖先项 → `jumpNestLevel(idx)`（根为 `-1`）
- 当前项不可点
- 文案：`ruleTitle`，`graphKind==='flow'` 且无「子流程」则后缀 ` (子流程)`
