# language: zh-CN
# capability: review-freeze
# purpose: 定义 review 五信号聚合审查的合同与 archive freeze/thaw 冷备合同(7z 格式自洽双向回置)。
# scope: packages/core/src/review/, packages/core/src/archive/, apps/cli/src/, packages/core/templates/shared/

功能: review-freeze

  @req:r23 @human
  场景: review 五信号聚合合同
    - `review` MUST 输出 signals 数组,元素字段 MUST 为 kind/capability/count/detail;kind MUST 覆盖 pending(规则无匹配验收)、manual、unbound(v1 孤儿语义:无 @req 链接的验收场景)、stale(v1 语义:基于 base-ref/scope 的真实 staleness 计算)、locked(恒 0)、validate(sweep FAIL 汇总;v1 快照内部 sweep 的恒失败缺陷不复制);JSON MUST 含 summary{criticalCount, warningCount},warningCount MUST 等于 pending 总数,criticalCount MUST 等于 sweep FAIL 的 capability 数;退出码 MUST 仅在 criticalCount > 0 时非零;`--capability` MUST 限定单一 capability;`--export-html <path>` MUST 写出自包含 HTML 报告。

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
    - `archive thaw --change <名>`(可重复)MUST 将冷备中的归档目录回置到 `llmanspec/changes/archive/`;未知名 MUST 报错并列出可用条目;冷备 MUST 为 7z 格式,v2 的冻结产物 MUST 可被自身解冻(自洽双向)。

  @req:r25 @executable
  场景: 冻结解冻自洽
    假如 一个含已归档目录的临时仓库
    当 v2 运行 freeze 后再 thaw 回置该目录
    那么 目录完整回到 changes/archive 下
    而且 内容与冻结前一致

  @req:r33 @human
  场景: review --capability 过滤口径
    - `review --capability <C>` MUST 将 pending/manual/unbound/stale 四类信号限定为 C(其余 capability 的信号 MUST NOT 输出),locked 与 validate 汇总 MUST 保持全局口径,退出码语义不变;`--json` 输出 MUST 同样过滤;未提供 `--capability` 时 MUST 保持全量信号。

  @req:r33 @executable
  场景: capability 过滤生效
    假如 本仓库的真实 llmanspec 工作区
    当 运行 v2 的 review --json 并限定单一 capability
    那么 四类信号仅含该 capability 且 locked 与 validate 保持全局

  @req:r56 @human
  场景: thaw 目的地覆盖
    - `archive thaw` MUST 支持 `--dest <path>` 将回置目标改为指定目录(目录不存在 MUST 自动创建);缺省回置目标 MUST 仍为 `llmanspec/changes/archive/`。

  @req:r56 @executable
  场景: thaw 目的地覆盖
    假如 一个含冻结归档的临时仓库
    当 运行 archive thaw --dest
    那么 条目完整落到指定目录
