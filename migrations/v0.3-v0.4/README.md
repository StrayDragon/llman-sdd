# v0.3 → v0.4 迁移指引：报告型命令缺省 TOON

0.4.0 起，六个报告型命令的**缺省输出**从人读文本变为 TOON
（https://github.com/toon-format/toon ，JSON 数据模型的无损紧凑编码）：

| 命令                    | 0.3 缺省   | 0.4 缺省 | 旧人读形态       |
| ----------------------- | ---------- | -------- | ---------------- |
| `review`                | 人读行     | TOON     | `--output human` |
| `validate [--all]`      | 人读报告行 | TOON     | `--output human` |
| `list` / `list --specs` | 列布局     | TOON     | `--output human` |
| `show <item>`           | 全文渲染   | TOON     | `--output human` |
| `config skills`         | 文本       | TOON     | `--output human` |
| `index check`           | 文本行     | TOON     | `--output human` |

不受影响：`change *`、`init`、`spec *`、`project *`、`graph`、`review --export-html`、
所有退出码语义。

## 三条迁移路径

1. **agent / LLM 消费（推荐）**：无需改动——TOON 即为该场景设计（较 pretty JSON 省
   ~40% token，表头 `[N]{fields}` 自带长度/字段护栏，截断可被模型察觉）。
2. **grep 人读文本的脚本**：在命令后追加 `--output human`，输出与 0.3 缺省逐字节一致。
3. **结构化消费**：`--json` / `--compact-json` 别名保留，输出与退出码保持 v1 字节不变；
   新代码可用 `--output json|compact-json|toon`。

## 行为差异明细

- `validate` 新增 `--include-info`：0.3 的 `--json` 会输出 INFO 级 issue（如 pending
  规则提示），0.4 缺省剔除（仅 WARNING+）；恢复全量请加 `--include-info`。`valid`
  判定、summary、退出码不变。
- `show` 的 `--output` tokens 新增 `toon|human`；`meta-only`/`no-scenarios`/`reqs-only`/
  `deltas`/`-r` 归入 human 文本面（v1 的"文本模式 no-op 渲染"语义不变）。
- `--compact-json` 仍须与 `--json` 同用（v1 守卫）；standalone 紧凑用 `--output compact-json`。

无需运行迁移脚本——本变更为纯 CLI 输出层，不涉及 `llmanspec/` 工件格式。
