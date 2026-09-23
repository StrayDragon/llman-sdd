# Design: BDD executable 化 LOWER 批(init + monorepo + review-freeze 元基座)

## 决策 1:r17/r18 直调 core 纯函数,新步骤收敛到单一模块

全部新步骤写入 `tests/bdd/steps/meta-foundation.ts`(步骤注册是全局的,runner 按 first-match 分派);断言语义改写自 `tests/unit/templates.test.ts` 既有断言。两处不走纯函数的语义点:

- r17「落盘单换行」:经 `runInit(makeNodeIo(tempRoot), …)` 真实落盘后读回 SKILL.md 断言恰好一个尾换行(与 domain.ts r19 场景同形态)——验收对准对外可见产物而非 init 内部表达式。
- r18「unit 级独立回退」:经 `loadLocaleResource`/`loadUnitRegistry` + 内存 TemplateIo 桩断言——同一回退链下 units 资源落到 en、skill 资源首命中 zh-Hans,证明按资源独立回退。

## 决策 2:r1-r4 走只读文件对账脚本,复用 smoke 全局步骤

四条规则各配一个只读断言脚本(`tests/bdd/assert/*.ts`,退出码即判定,失败逐条 console.error),场景复用既有全局步骤「工作目录是仓库根 / 执行命令 / 退出码为 0」(与 r67 模板对账门同形态),不新增步骤语言。

不采用 proposal 中「合并为 1-2 个场景」的选项:1 规则 → 1 场景 → 1 脚本的对账映射在 review 与日后归档时可逐条定位;四个 bun 子进程成本可忽略。

保留判定:四条**全部 @executable 化,无保留 @human**。理由:各条均含文件可断言的 MUST(workspaces 声明与 core 依赖方向、justfile recipe 面、oxlint ignorePatterns、runner 存在性与 config bdd 绑定);既有 qa 锁行为、golden 锁渲染产物,均不锁仓库结构合约本体——本批对账门补上「防静默删除」这层。

## 决策 3:r24 的 7z 守卫 = 依赖探测快失败,非运行时跳过

核实结论:7z 能力来自打包依赖 **7z-wasm**(`packages/core/src/archive/sevenzip.ts` 适配,无系统 7z 依赖),由 bun.lock 钉版、`bun install` 即具备;`tests/bdd/runner.ts` 仅支持注册期跳过(静态 `@skip`/`@experimental` 标签与 `skipScenarios` 选项),bun:test(test 回调第二参为 done 回调)无运行时 skip 语义。既有 r25 executable 场景(冻结解冻自洽)即无守卫直跑。

故守卫落地为:Given 步骤内 `import.meta.resolve('7z-wasm')` 探测,依赖缺失时抛出带「7z 环境守卫」标记的清晰错误——依赖缺失属环境/依赖损坏,快失败优于静默跳过(runner 无条件跳过通道,这是其支持范围内最干净的方式)。

## 权衡

- r24 场景只锁 freeze 侧合同(`--before` 截断、`--keep-recent` 按名保留、`--dry-run` 零变更、`--list`、删原目录、写 `freezed_changes.7z.archived`);thaw 回置自洽已由 r25 executable 场景锁定,不重复设门。
- r3 的副作用收敛断言采用白名单(现孔:`archive/sevenzip.ts`、`git/spawnGit.ts`、`index.ts` 嵌入模板读取):新增直连必须显式更新对账脚本,正是合约锁定的语义。
