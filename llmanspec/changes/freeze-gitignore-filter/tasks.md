# 任务:freeze 内容过滤(gitignore 层叠)

测试边界(seam,已与用户确认沿用既有):BDD = 真实 CLI 子进程 + 临时仓库
(`tests/bdd/steps/meta-foundation.ts` 模式);unit = 直调 `runFreeze` + 真实 7z 适配器,
过滤逻辑另加纯函数单测。验证阶梯按 `llmanspec/AGENTS.md`(L1 定向单测 → L2 定向 BDD
→ L3 `validate --check` → L4 finalize 兜底)。

- [ ] T1: 忽略链核心模块(core,纯域)
  `packages/core/src/archive/` 新增忽略链模块(`ignore` 包层叠求值 + walk + 项目根
  探测),`packages/core` 增依赖 `ignore` 并更新根 lockfile;纯函数单测覆盖:层叠
  优先级(最深 `.gitignore` 胜)、`/` 锚定、`!` 取反、目录尾斜杠、`**`、`.git`
  恒剪枝、无 `.git` 时回退实例根、用户文件最高优先、用户文件不存在报错。
  验证:`bun test tests/unit/<新增>`(L1)。
- [ ] T2: runFreeze 接入过滤 [blocked-by: T1]
  过滤产出文件级 entries 传入 `sz.add`;候选零文件时写卡前报错(磁盘零变更);
  输出追加排除摘要行(仅排除数 >0);`FreezeOpts.ignoreFiles` 贯通。
  验证:`bun test tests/unit/archive.test.ts` 增真 7z 过滤往返(排除生效、正文入包、
  thaw 回置自洽)+ 既有用例不红(L1/L2)。
- [ ] T3: CLI 选项与 BDD 场景落地 [blocked-by: T2]
  `apps/cli` 注册 `archive freeze --ignore-file <path>`(可重复,cwd 字面语义,r116
  先例解析为绝对路径);r120 场景步骤实现于 `tests/bdd/steps/meta-foundation.ts`
  模式:根 `.gitignore` 过滤、嵌套层叠、`--ignore-file` 最高优先、无 git 根回退、
  过滤后 freeze→thaw 自洽。
  验证:`bun test tests/bdd -t "freeze"`(L2)定向绿。
- [ ] T4: 文档与门禁收尾 [blocked-by: T3]
  `llmanspec/AGENTS.md` 依赖映射补 `ignore` 条目;`just qa` 全绿;在 change 分支
  相对 merge-base 复核既有 freeze/thaw 套件(binary 往返、scope-boundaries 多根
  场景)无回归;`llman-sdd validate freeze-gitignore-filter --check`(L3)。
