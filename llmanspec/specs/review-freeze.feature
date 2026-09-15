# language: zh-CN
# capability: review-freeze
# purpose: 定义 review 五信号聚合审查的合同与 archive freeze/thaw 冷备合同(7z 格式与 v1 双向兼容)。
# scope: packages/core/src/review/, packages/core/src/archive/, apps/cli/src/, packages/core/templates/shared/

功能: review-freeze

  @req:r23 @human
  场景: review 五信号聚合合同
    - `review` MUST 输出 signals 数组,元素字段 MUST 为 kind/capability/count/detail;kind MUST 覆盖 pending(规则未挂验收)、manual、unbound(验收不符 bdd.bindings 判据)、stale(占位,v2 detail 标注 deferred)、locked(恒 0)、validate(sweep FAIL 汇总);JSON MUST 含 summary{criticalCount, warningCount},warningCount MUST 等于 pending 总数,criticalCount MUST 等于 sweep FAIL 的 capability 数;退出码 MUST 仅在 criticalCount > 0 时非零;`--capability` MUST 限定单一 capability;`--export-html <path>` MUST 写出自包含 HTML 报告。

  @req:r23 @executable
  场景: v2 review 信号形状合法
    假如 本仓库的真实 llmanspec 工作区
    当 v2 运行 review
    那么 signals 覆盖六种 kind
    而且 summary 含 criticalCount 与 warningCount
    而且 退出码与 criticalCount 一致

  @req:r24 @human
  场景: freeze 冷备合同
    - `archive freeze` MUST 将候选归档目录写入 `llmanspec/changes/archive/freezed_changes.7z.archived` 并删除原目录;候选 MUST 为目录名带 `YYYY-MM-DD-` 前缀且早于 `--before` 日期者,`--keep-recent N` MUST 按名保留最近 N 个不冻结;`--dry-run` MUST 仅列候选不做变更;`--list` MUST 列出冷备内条目。

  @req:r25 @human
  场景: thaw 回置与双向兼容
    - `archive thaw --change <名>`(可重复)MUST 将冷备中的归档目录回置到 `llmanspec/changes/archive/`;未知名 MUST 报错并列出可用条目;冷备 MUST 为 7z 格式,v1(Rust)冻结的归档 MUST 可被 v2 解冻,v2 冻结的归档 MUST 可被 v1 解冻。

  @req:r25 @executable
  场景: v1 冻结 v2 解冻
    假如 一个含已归档目录的临时仓库且已用 v1 冻结
    当 v2 运行 thaw 回置该目录
    那么 目录完整回到 changes/archive 下
    而且 内容与冻结前一致
