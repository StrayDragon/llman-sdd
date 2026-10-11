---
depends_on:
  - check-stc-eval-a-b
branch: sdd/eval-pi-auth-json
base_branch: main
base_sha: 3de09f96db143d87e31b80d3c0fd4d12065b03f1
---

## eval 容器凭据注入：宿主 Pi auth.json 经 pi-config 只读 bind 链

## Why

eval 容器内 Pi 的凭据现状是 `models.json apiKey` 字面量（缺省 `'not-needed'`）——接真实 key 时会落盘进 `pi-config/models.json`，或要求 export env（多一处暴露面）。用户本机 `~/.pi/agent/auth.json` 已是 Pi 正规凭据层（凭据优先级 `--api-key` > auth.json > models.json apiKey > env，见 Pi docs/models.md），容器内 Pi 原生消费它。

需求（用户定案 b——走完整 change，改 r86 合约面）：

- 宿主 `~/.pi/agent/auth.json`（实际路径单数 agent）作为缺省凭据源，`writePiRuntime` 时拷入 `pi-config/auth.json`。
- 复用既有 RO bind `/opt/pi-seed` → `pi-wrapper.sh` cp 到可写 `/tmp/pi-config` 链，零新机制；缺失时跳过并 stderr 提示（oracle 无需）。
- 密钥绝不入公共仓库：`pi-config/` 在 `.local/eval/runs/`（gitignored）、`eval/groups.yaml` gitignored、宿主家目录在仓库外——三层保障随本 change 断言固化。
- 副产品：auth.json 已含 `zai-coding-cn` 条目，注入链就绪后切 GLM 仅需 groups.yaml 改 provider/api/model。

## What Changes

- `eval/run.ts` `writePiRuntime`：读 `~/.pi/agent/auth.json`（存在时）写 `pi-config/auth.json`；缺失跳过 + stderr 提示（不 die）。
- `eval/tasks/playbook/environment/pi-wrapper.sh`：存在才 `cp /opt/pi-seed/auth.json`。
- `eval/groups.yaml.example` 注释：auth.json 自动注入，yaml 内无需写密钥。
- `llmanspec/specs/eval-playbook` r86 措辞延伸：auth.json 经 pi-config 只读 bind 注入，宿主家目录为缺省源，绝不入库（tests/bdd 补场景：注入存在/缺失双分支 + gitignore 三层断言）。
- `tests/unit/eval-groups-schema.test.ts`：auth 注入纯函数（路径解析/缺失容错）单测。

## Capabilities

- `specs/eval-playbook`（r86 延伸）。

## Impact

- 仅 eval runner 与 wrapper 脚本；不改 CLI、不改 specs 解析、不改 reward 聚合。
- 前置依赖 `check-stc-eval-a-b`（eval A/B 与文风门先落地，避免同分支污染）。
