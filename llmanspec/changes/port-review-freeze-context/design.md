# Design

## review(packages/core/src/review/)

- 信号聚合(输入 = spec IR + validate sweep 结果):
  - `pending`:@human 规则中未挂任何 executable 验收的数量
  - `manual`:@human @manual 数量
  - `unbound`:@executable 场景中不符合 config `bdd.bindings` 判据的数量(tags 判据下 = 未带全部指定标签)
  - `stale`:占位(count 0,detail `deferred`;v1 parity 的 detail 不进 golden)
  - `validate`:sweep 中 FAIL 的 capability 数(detail 汇总)
  - `locked`:恒 0(v2 无锁定确认元数据)
- JSON:`{signals:[{kind,capability,count,detail}], summary:{criticalCount, warningCount}}`,capability 按 id 排序;`warningCount = pending 总数`;`criticalCount = validate sweep FAIL 数`;退出码:criticalCount > 0 → 非零
- 文本布局:`Review: critical=N warning=M` 头 + 每 capability 四段 + `  - <detail>` 行 + locked/validate 段(与 v1 同构,活体 golden 归一化 stale detail 与 INFO 行)
- `--export-html`:渲染 `packages/core/templates/shared/review.html`(v1 资产),自包含单文件

## 7z 适配器(packages/core/src/archive/sevenzip.ts)

- 7z-wasm(Emscripten):`SevenZip({noInitialRun:true})` → `FS.mkdir/mount(NODEFS)/chdir` + `callMain(['a'|'l'|'x', ...])`;spike 已验证 Bun 下压缩/列表/解压全通、目录结构保持
- 提取目标必须是新目录(WASM 版对已存在 -o 目录报错)——thaw 流程先解到新挂载点再落位
- 系统无 7z 依赖,纯 WASM 自包含

## freeze/thaw 编排(packages/core/src/archive/freeze.ts)

- 候选选择:归档目录名带 `YYYY-MM-DD-` 前缀;`--before DATE` = 严格早于;`--keep-recent N` = 按名排序后保留最近 N 个不冻结;`--dry-run` 仅列候选;`--list` 列冷备内条目
- freeze:逐候选 `a` 进 `changes/archive/freezed_changes.7z.archived`(已存在则更新)→ 删除原目录;thaw:`--change <名>`(可重复,名 = 带日期前缀的归档目录名)解到新挂载点后回置 `changes/archive/`;未知名 → 报错并列出可用条目

## 验收

- 单元:候选选择/keep-recent/信号聚合/退出码
- 双向兼容集成:临时仓库中 v1 `archive freeze` → v2 `thaw --list`/`thaw` 回置;v2 `freeze` → v1 `thaw`
- 活体 golden:`review` / `review --json`(归一化 stale detail)
- BDD `@executable`
