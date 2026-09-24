# language: zh-CN
# capability: init-generators
# purpose: 定义模板渲染语义、locale 兜底链、init 产物面与 skills 命名空间治理,验收基准为渲染基线归一化 diff。
# scope: packages/core/src/templates/, packages/core/src/init/, packages/core/templates/, apps/cli/src/commands/init.ts, tests/golden/

功能: init-generators

  @req:r17 @human
  场景: 模板渲染语义
    - 模板变量 MUST 全部为字符串注入,未定义变量 MUST 渲染为空(Lenient);`unit(id)` MUST 递归展开对应单元内容(同环境同变量),嵌套深度 MUST 以 32 为上限,缺失 id MUST 报错;渲染产物 MUST 去除尾随空白,落盘时 MUST 以单一换行结尾。

  @req:r18 @human
  场景: locale 兜底链
    - locale MUST 先归一化(zh/zh-cn/zh-hans 前缀 → zh-Hans,en 前缀 → en,空值 → en),回退链 MUST 为 [归一化值, 语言主部, en] 去重序列;单元资源 MUST 按 unit 级独立回退(首个命中 locale 生效)。

  @req:r19 @human
  场景: init 产物面与命名空间治理
    - `init` MUST 产出 llmanspec/config.yaml(含 $schema 头行与 locale 缺省)、specs/.gitkeep、changes/archive/.gitkeep,并以托管块方式写根与 llmanspec 的 AGENTS.md(已有内容保留);`init --update` MUST 渲染默认 10 个 skills 加 extra_skills 扩展到 `.agents/skills/<stem>/SKILL.md`,且 MUST 仅清理 `llman-sdd-` 前缀内候选集外的目录;每个渲染产物 MUST 通过 ethics 治理门(5 个 ethics 键齐全)。渲染产物与 golden 基线(tests/golden/baseline/)的版本号归一化比对 MUST 同时覆盖 zh-Hans 与 en 两个 locale,且 MUST 随 bun test 套件运行;比对失败 MUST 报出差异文件名并区分缺失、多余与内容不同。

  @req:r19 @executable
  场景: 渲染与基线归一化一致
    假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
    当 v2 渲染全部 skills
    那么 与 golden 基线归一化版本号后 diff 为空
    而且 每个 SKILL.md 通过 ethics 治理门

  @req:r19 @executable
  场景: en 渲染与 en 基线归一化一致
    假如 本仓库的等价 config(en 与 bdd 配置)
    当 v2 渲染全部 skills
    那么 与 golden en 基线归一化版本号后 diff 为空
    而且 每个 SKILL.md 通过 ethics 治理门

  @req:r49 @human
  场景: init 目标路径
    - `init [path]` MUST 支持位置参数指定目标目录(相对或绝对,不存在 MUST 自动创建),全部产物(llmanspec/、根 AGENTS.md、.agents/skills/)MUST 落在该目录下;缺省 MUST 为当前目录。

  @req:r50 @human
  场景: init locale 选项别名
    - `init` MUST 接受 `--lang <locale>` 作为 `--locale` 的别名(渲染语义完全等效);两者同给 MUST 报错。

  @req:r66 @human
  场景: spec 撰写配对引导判据
    - skills 撰写引导(单轨 feature 撰写节与 tag 语法节)MUST 含 @human/@executable 分流判据:凡 GWT(假如/当/那么)可表达的自动化判定行为 MUST 落 @executable 验收场景并挂回对应规则,@human 仅用于无法自动化判定的人工约束,新增 @human 条款无可配对验收时 MUST 在 proposal/design 记录不可执行理由;判据 MUST 在 zh-Hans 与 en 双 locale 模板中同语义存在。

  @req:r49 @executable
  场景: init 子目录目标
    假如 一个空的临时工作区
    当 运行 init 指向不存在的子目录
    那么 产物面完整落在该子目录下

  @req:r50 @executable
  场景: lang 别名等效
    假如 一个空的临时工作区
    当 运行 init --lang zh-Hans
    那么 config locale 为 zh-Hans 且同给两个别名报错

  @req:r66 @executable
  场景: 配对判据入渲染产物
    假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
    当 渲染 propose skill 与 validation-hints 单元
    那么 产物含 @human/@executable 分流判据小节标识
    而且 zh-Hans 与 en 产物均含该判据

  @req:r17 @executable
  场景: 模板渲染语义可执行验收
    假如 v2 模板引擎与样例单元表
    当 v2 渲染样例模板并经 init 落盘临时工作区
    那么 未定义变量渲染为空且字符串变量注入一致
    而且 unit 递归展开且缺失 id 与嵌套超限均报错
    而且 渲染产物无尾随空白且落盘产物以单一换行结尾

  @req:r18 @executable
  场景: locale 兜底链可执行验收
    假如 v2 locale 输入集与双语资源桩
    当 v2 计算 locale 归一化、回退链与资源回退
    那么 zh 与 en 变体按映射表归一化且空值回退 en
    而且 回退链为去重的归一化值语言主部与 en 序列
    而且 资源按 unit 级独立回退且首个命中 locale 生效

  @req:r70 @human
  场景: 模板指引语义对齐
    - 模板 skills 与 units(zh-Hans 与 en 双 locale)中对 CLI 的行为性指引 MUST 与实际值域与行为一致:review 人审检查点 MUST 用无旗标调用(--capability 值域仅限 spec id)、已删除的兼容旗标 MUST NOT 再被推荐、change archive 收口 MUST 表述为与 finalize 同样的自动提交、context unavailable 修复指引 MUST 覆盖 index stale 与 chat model 未设双分支、引用不存在的 JSON 字段 MUST NOT 出现;propose「写 tasks.md」一节与 apply「勾选」一节 MUST 含约束句——tasks.md 只列实现与验证任务,收口(change finalize/change archive)是流水线步骤 MUST NOT 列为任务;对账 MUST 以自动门禁纳入 bun test 套件(随 qa 运行),以禁用模式与必含标记声明(模式 MUST 覆盖已移除命令 checkpoint/change delta/feature_delta/solidify/project import 与已删除旗标及修饰符),违例 MUST 逐条报出来源模板与违例原因,缺失必含标记 MUST 同样报出模板与缺失标记;对账面为 packages/core/templates/** 模板源头,渲染产物与 golden 基线为下游,不重复设门。

  @req:r71 @human
  场景: authoring helpers 撰写引导
    - propose 撰写引导 MUST 将 spec authoring helpers 声明为结构化新增首选(next-req-id 全局 id 分配、add-req/add-scenario 追加规则与验收、skeleton 新建 capability、resolve-req 反查),手改 .feature MUST 保留为逃生门;引导 MUST 在 zh-Hans 与 en 双 locale 模板中同语义存在。

  @req:r70 @executable
  场景: 指引语义对齐门禁通过
    假如 工作目录是仓库根
    当 执行命令 "bun test tests/unit/template-guidance-parity.test.ts"
    那么 退出码为 0

  @req:r71 @executable
  场景: authoring helpers 引导入渲染产物
    假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
    当 渲染 propose skill 与 validation-hints 单元
    那么 zh-Hans 与 en 产物均含 authoring helpers 引导标识
