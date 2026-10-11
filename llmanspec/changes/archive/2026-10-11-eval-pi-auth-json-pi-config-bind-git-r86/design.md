# design

## 注入链（复用既有管道，零新机制）

宿主 `~/.pi/agent/auth.json`（单数 agent；`PI_CODING_AGENT_DIR` 缺省值）
→ `eval/run.ts writePiRuntime` 读存在则写 `pi-config/auth.json`（缺失跳过+stderr 提示，不 die——oracle 无凭据需求）
→ 既有 RO bind `/opt/pi-seed`（dockerMounts 不动）
→ `pi-wrapper.sh` 增一行：存在才 `cp /opt/pi-seed/auth.json $PI_CODING_AGENT_DIR/`
→ 容器内 Pi 按凭据优先级 `--api-key > auth.json > models.json apiKey > env` 自行消费。

**不 export 任何 env**：auth.json 是 Pi 一等凭据层，容器内直接读；harbor 全程不接触密钥（本仓自管 models.json 已绕开 harbor overlay，`-m` 解析的 `OPENAI_API_KEY` 缺省 `'not-needed'` 字面量继续成立）。

## 不入库三层断言（r86 延伸场景）

1. `pi-config/` 生成于 `.local/eval/runs/<id>/`——`.gitignore` L204 已有 `.local/eval/`。
2. `eval/groups.yaml` gitignored（L205）——用户填明文的唯一合法落点。
3. 宿主 `~/.pi/` 仓库外。
   BDD 场景断言：`.gitignore` 含此二行 + auth 注入函数对缺失文件容错。

## r86 措辞延伸（最小增句）

在 eval-playbook r86 描述尾追加一句：auth.json 经 pi-config 只读 bind 注入、宿主 `~/.pi/agent/auth.json` 为缺省源、缺失跳过不阻断、凭据不入库（gitignore 三层）。不改既有 r86 语义（Pi 注入完整 Responses 配置条款不动）。

## 测试 seam

- 纯函数 `resolveAuthJsonPath(home?)` + `copyAuthIfExists(src,dest)`（eval/run.ts 导出或独立 lib）→ `tests/unit/eval-auth.test.ts`：路径拼接/缺失容错/拷贝成功三例。
- BDD：r86 新嵌套场景「auth 注入缺失容错与 gitignore 三层」——假如临时 home 无 auth.json / 当 跑注入函数 / 那么不抛错且 stderr 提示；另以文件断言 `.gitignore` 行。
- wrapper 行为：无独立 harness（容器内脚本），以 grep 断言 `pi-wrapper.sh` 含条件 cp 行进单测。

## 权衡记录

- 不改 `groups-schema.ts apiKey` 逻辑：`'not-needed'` 缺省与 `pi.api_key` 显式值两径保留（vLLM 无鉴权/显式 key 两用例），auth.json 是第三优先源——Pi 凭据优先级天然分层，无冲突。
- auth.json 条目结构（`{provider:{type,key}}`）由 Pi 自治，本 change 不校验其内部 schema（跟随上游）。
