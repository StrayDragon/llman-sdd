# Design: 报告型命令缺省 TOON

## 决策 1:缺省解析优先级

`--output <fmt>`(显式)> 兼容别名(--json → json,--compact-json → compact-json)> 缺省 toon。--output 与 --json 同给时 --output 赢(文档写明);--compact-json 保留「须与 --json 同用」的既有守卫(别名面 v1 parity),standalone 紧凑走 `--output compact-json`。

## 决策 2:toon 模式的人读 stderr 通道保留

stdout 报告进 TOON;stderr 的错误摘要(`Error: validation failed`)与 r47 阶段强制 ERROR 行保留人读——错误面是运维信号,不属报告形态。Next steps 引导行仅 human 模式输出(agent 自有 skills 引导)。

## 决策 3:index check 的 IR 最小化

{fresh, notes[]}——fresh 驱动退出码,notes 承载既有文本行内容;不为 index 单独设计结构化检查明细(其文本本就是两三行)。

## 决策 4:版本与迁移

版本号随发布流程(CHANGELOG 记 Unreleased/BREAKING);migrations/v0.3-v0.4/README.md 给下游三条迁移路径:① 直接吃 toon(agent 推荐);② 加 --output human 保旧脚本;③ 用 --json 拿稳定机器面。AGENTS.md 定案改写与 toon 技术栈登记同 change 落地(均属 llmanspec/ 元文档,绑定分支可编辑)。

## 权衡

- 备选「config.yaml 加 output: 缺省项」被否:每项目配置漂移会让同一 CLI 行为不可预测,缺省必须全局一致。
- 备选「context 同步 toon 化」被否:context 恒 JSON 且是纯 agent 命令,收益为零,塞进来徒增合约面;归后续。
