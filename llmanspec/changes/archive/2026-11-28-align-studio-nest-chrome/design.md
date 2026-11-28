# 嵌套贴框导航与视口记忆

## 对照 demo

| 项 | demo | 现状 | 改法 |
| --- | --- | --- | --- |
| 返回上层 | 贴在展开框左上，文案「返回上层 \<父层名\>」旁为当前层 | 画布 `fixed top-[56px]` 悬浮条 | 移入 `MachineBoundaryNode` 左上，`pointer-events-auto` |
| 下钻文案 | `subLabel \|\| (flow ? 进入子流程 : 进入子状态机)` | 「进入子机」 | 同 demo 缺省；IR 无 `subLabel`，不新增字段 |
| 进入后视口 | 图组居中 | 常贴上沿；`viewKey` 不含 nest | `machine:${key}\|nest:${path}`；无记忆则 fitView |

## 视口 key

```
machine:${activeMachineKey}                  // 未下钻
machine:${activeMachineKey}|nest:${k1,k2,…}  // nestStack 的 machineKey 序列
```

同一子机从不同宿主进入（DAG）路径不同，视口分开记。返回上层仍按既有规格选中并居中宿主。

## 不做

- 不给 `StudioStateNode` 加 `subLabel`（无规格声明来源）。
- 不改门户、深链、抽取。
