# v0.10 → v0.11 迁移

本窗口包含冻结平铺卡的 YAML 形态归一、技能发现面的调整，以及命令面的替换。被删掉的命令没有别名。

## 命令替换

| 旧命令                                           | 新命令                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `llman-sdd change finalize <id>`                 | `llman-sdd change archive <id>`（另要求干净工作区；没有 `--force`）                |
| `llman-sdd archive freeze`                       | `llman-sdd freeze`                                                                 |
| `llman-sdd archive thaw`                         | `llman-sdd thaw`                                                                   |
| `llman-sdd change attach <id>`                   | `llman-sdd change start <id>`（默认分支创建 `sdd/<id>`；其他本地分支绑定当前检出） |
| `llman-sdd spec skeleton <capability>`           | `llman-sdd spec new <capability>`                                                  |
| `llman-sdd spec migrate-native`                  | 已删除。历史标签保持惰性                                                           |
| `llman-sdd project migrate strip-legacy-headers` | 已删除。残留头注释手工删                                                           |
| `llman-sdd project migrate --kind`               | 已删除                                                                             |
| `--version-expr`                                 | 已删除。用 `--from-version` 与 `--to-version`                                      |

## 技能发现

`extra_skills` 与 `config skills` 不再是配置合同。`llman-sdd init --update` 写入全部内置
`llman-sdd-*` 技能,并删除根 `AGENTS.md` 里已有的 `LLMANSPEC` 标记段(标记外正文保留)。
无此前缀的自定义技能不动。`llmanspec/AGENTS.md` 的托管块仍然刷新。

```bash
# 删掉 config.yaml 里的 extra_skills(留着也会被当作未知键忽略)
llman-sdd init --update
llman-sdd init --check
```

`--check` 要求已安装技能的主版本号与次版本号和当前 CLI 相同。不一致时按提示再跑 `--update`。

## 冻结平铺卡

目的是让 llman-sdd 的产物在**通用工具链**下开箱可用——不需要用户为它写钩子豁免。

## 破坏面

无行为破坏。存量围栏卡的读取兼容保留,未跑迁移的仓库照常工作;跑完迁移后,卡的语义
(`title` / `depends_on`)与依赖边逐条不变,只是不再带 `---` 围栏。

## 为什么需要

`freeze` 在 0.9 时代产出带 `frozen:` 段的元数据卡,整文件用 `---` 围栏包裹。
0.10 起写入侧改为无围栏单文档 YAML,但存量围栏卡按「不迁移」保留。围栏使一个文件成为
**多文档** YAML 流,于是 pre-commit 官方 `check-yaml`(默认严格单文档)对这批卡恒报:

```
only single YAML document expected but multiple found
```

用户此前只能给钩子加 `exclude` 或 `--allow-multiple-documents`,等于让归档卡脱离通用
校验。v0.11 起工具提供归一入口,把这个缺口从用户侧收回工具侧。

## 升级步骤

```bash
# 1. 先看会改哪些卡(零写入)
llman-sdd project migrate frozen-cards-unfence --dry-run

# 2. 执行归一(幂等,可重复运行)
llman-sdd project migrate frozen-cards-unfence

# 3. 去掉你此前为归档卡加的 check-yaml 豁免(如果有)
#    .pre-commit-config.yaml 里 check-yaml 不再需要 exclude 或
#    --allow-multiple-documents

# 4. 全量校验
llman-sdd validate --all --strict
```

## 自检

- `llmanspec/changes/archive/` 下没有任何 `<YYYY-MM-DD>-<id>.yaml` 以裸 `---` 行为首行。
- 不带任何豁免的 `check-yaml` 钩子在归档目录上通过。
- `llman-sdd graph --scope archived` 输出的冻结节点数与依赖边与升级前一致。
- 重复运行归一动作输出 `0 card(s) normalized`。

## 归一不碰什么

判定从严,宁可漏归一也不误改:

| 输入                                                            | 行为                 |
| --------------------------------------------------------------- | -------------------- |
| 首末行恰为 `---`、去围栏后是单文档、键只有 `title`/`depends_on` | 归一                 |
| 无围栏卡                                                        | 跳过(幂等)           |
| `title: "a --- b"` 这类值里含 `---`                             | 跳过(首行不是裸围栏) |
| 去围栏后是多文档或语法错                                        | 跳过                 |
| 含 `frozen:` 等超出 `title`/`depends_on` 的键                   | 跳过(留待人工判断)   |
