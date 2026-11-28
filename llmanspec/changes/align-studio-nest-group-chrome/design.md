# 外层节点组贴框

demo：`parent-context-frame` 包住左右门户与内层 `machine-boundary-frame`；`nest-frame-crumb` 在外框 `left:16px; top:-16px`。

本仓门户在 `frameX-224` / `frameX+frameW+64`。外框矩形由 `nestGroupFrameRect(inner, hasIn, hasOut)` 计算，与门户占位对齐。面包屑从内框挪到外框节点。
