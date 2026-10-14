# v0.7 → v0.8 迁移:手工治理元数据退役(reviewed-through 印章与 scope 头)

0.8.0 移除 spec 头部的 `# scope:` 与 `# reviewed-through:` 结构字段、staleness/STALE
警告链与 `review` 的 `stale` 信号。spec 头契约收缩为 `# capability:` + `# purpose:`
两项;关联判定改由 pageindex 索引(context)与测试绑定(`specs.check_command`)承担;
历史真相以 git 台账为准(`git log -- <spec>`,全 `archive(sdd):` 提交天然单调)。

## 破坏面

1. **spec 头格式**:`# scope:` / `# reviewed-through:` 不再被 parser 识别(降级为普通
   注释,不报错);validate 不再检查 scope 路径存在性;`spec skeleton` 不再生成该行。
2. **机器输出**:`validate --json` 载荷去 `staleness` 键;`review` 信号集
   `{unbound, locked, validate}`(去 `stale`),`summary.warningCount = unbound 计数`;
   spec show JSON 去 `validScope`/`staleness` 字段。
3. **CLI 面**:`LLMANSPEC_BASE_REF` 环境变量不再被读取;core 公共导出收缩
   (`evaluateStaleness`/`notApplicableStaleness`/`applyStrict`/`scopeCrossings`/
   `specRelFor`/`InstanceContext` 移除)。

## 升级步骤

```bash
# 0. 查看 agent 可执行的迁移手册(可整段交给任何 agent 执行与自查):
llman-sdd project migrate prompt --version-expr '0.7.5->0.8.0'

# 1. 一键剥除存量头(幂等;先预览):
llman-sdd project migrate strip-legacy-headers --dry-run
llman-sdd project migrate strip-legacy-headers

# 2. 刷新 skills / 模板产物(漂移 NOTE 也会提示):
llman-sdd init --update

# 3. 全量验证:
llman-sdd validate --all --strict
```

不迁移也可运行:存量头仅成为惰性注释,但会持续与新版 skill 文案不一致,建议执行。
