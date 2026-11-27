# llmanspec AGENTS.md

此文件由根目录的 `AGENTS.md` 托管块引用。可在此添加项目特定的规则、
上下文或约定，以便 AI 代理遵守。

## 人类定理（只读硬不变量）

- 若仓库存在 `llmanspec/theorems/`，其中条目为人类维护的只读硬不变量（可运行 `llman-sdd theorem list` 查阅，用 `llman-sdd theorem check` 核验封签与关联门禁）。
- 每次会话开始前 必须 查阅并严格遵守这些不变量；Agent 不得 擅自修改、删除或绕过 `llmanspec/theorems/` 内任何文件。

<!-- 在此行下方添加你的规则 -->
