# language: zh-CN
# capability: init-generators
# purpose: 定义模板渲染语义、locale 兜底链、init 产物面与 skills 命名空间治理,验收基准为渲染基线归一化 diff。
# scope: packages/core/src/templates/, packages/core/src/init/, packages/core/templates/, apps/cli/src/commands/init.ts, tests/golden/

功能: init-generators

  @req:r17
  规则: 模板渲染语义
    模板变量 MUST 全部为字符串注入,未定义变量 MUST 渲染为空(Lenient);`unit(id)` MUST 递归展开对应单元内容(同环境同变量),嵌套深度 MUST 以 32
    为上限,缺失 id MUST 报错;渲染产物 MUST 去除尾随空白,落盘时 MUST 以单一换行结尾。

    场景: 模板渲染语义可执行验收
      假如 模板引擎与样例单元表
      当 渲染样例模板并经 init 落盘临时工作区
      那么 未定义变量渲染为空且字符串变量注入一致
      而且 unit 递归展开且缺失 id 与嵌套超限均报错
      而且 渲染产物无尾随空白且落盘产物以单一换行结尾

  @req:r18
  规则: locale 兜底链
    locale MUST 先归一化(zh/zh-cn/zh-hans 前缀 → zh-Hans,en 前缀 → en,空值 → en),回退链 MUST 为 [归一化值, 语言主部, en]
    去重序列;单元资源 MUST 按 unit 级独立回退(首个命中 locale 生效)。

    场景: locale 兜底链可执行验收
      假如 locale 输入集与双语资源桩
      当 计算 locale 归一化、回退链与资源回退
      那么 zh 与 en 变体按映射表归一化且空值回退 en
      而且 回退链为去重的归一化值语言主部与 en 序列
      而且 资源按 unit 级独立回退且首个命中 locale 生效

  @req:r19
  规则: init 产物面与命名空间治理
    `init` MUST 产出 llmanspec/config.yaml(含 $schema 头行与 locale 缺省)、specs/.gitkeep、
    changes/archive/.gitkeep,并以托管块方式写根与 llmanspec 的 AGENTS.md(已有内容保留);`init --update` MUST 渲染默认 10 个
    skills 加 extra_skills 扩展到 `.agents/skills/<stem>/SKILL.md`,且 MUST 仅清理 `llman-sdd-`
    前缀内候选集外的目录;每个渲染产物 MUST 通过 ethics 治理门(5 个 ethics 键齐全)。渲染产物与 golden
    基线(tests/golden/baseline/)的版本号归一化比对 MUST 同时覆盖 zh-Hans 与 en 两个 locale,且 MUST 随 bun test 套件运行;比对失败
    MUST 报出差异文件名并区分缺失、多余与内容不同。

    场景: 渲染与基线归一化一致
      假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
      当 渲染全部 skills
      那么 与 golden 基线归一化版本号后 diff 为空
      而且 每个 SKILL.md 通过 ethics 治理门


    场景: en 渲染与 en 基线归一化一致
      假如 本仓库的等价 config(en 与 bdd 配置)
      当 渲染全部 skills
      那么 与 golden en 基线归一化版本号后 diff 为空
      而且 每个 SKILL.md 通过 ethics 治理门

  @req:r49
  规则: init 目标路径
    `init [path]` MUST 支持位置参数指定目标目录(相对或绝对,不存在 MUST 自动创建),全部产物(llmanspec/、根 AGENTS.md、
    .agents/skills/)MUST 落在该目录下;缺省 MUST 为当前目录。

    场景: init 子目录目标
      假如 一个空的临时工作区
      当 运行 init 指向不存在的子目录
      那么 产物面完整落在该子目录下

  @req:r50
  规则: init locale 选项别名
    `init` MUST 接受 `--lang <locale>` 作为 `--locale` 的别名(渲染语义完全等效);两者同给 MUST 报错。

    场景: lang 别名等效
      假如 一个空的临时工作区
      当 运行 init --lang zh-Hans
      那么 config locale 为 zh-Hans 且同给两个别名报错

  @req:r66
  规则: spec 撰写配对引导判据
    skills 撰写引导(单轨 feature 撰写节与 tag 语法节)MUST 含「可执行场景优先」判据并附带使用示例:凡 GWT(假如/当/那么)可表达、
    绑定步骤代码的自动化判定行为 MUST 落成 `场景:`(原生 gherkin 鼓励形态);仅当需求无法程序化表达(抽象目标、架构决策、
    治理/人工约束)或暂不转写时,才以 `规则:` 块承载需求并在 proposal/design 记录理由;无法配可执行场景的裸 `规则:`
    由聚合计数与 specs-compact 承担压降。历史标签(@executable/@rule/@human/@manual)不再教学。判据与示例 MUST 在 zh-Hans 与
    en 双 locale 模板中同语义存在。

    场景: 配对判据入渲染产物
      假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
      当 渲染 propose skill 与 validation-hints 单元
      那么 产物含「可执行场景优先」判据小节标识与使用示例
      而且 zh-Hans 与 en 产物均含该判据

  @req:r70
  规则: 模板指引语义对齐
    模板 skills 与 units(zh-Hans 与 en 双 locale)中对 CLI 的行为性指引 MUST 与实际值域与行为一致:review 人审检查点 MUST
    用无旗标调用(--capability 值域仅限 spec id)、已删除的兼容旗标 MUST NOT 再被推荐、change archive 收口 MUST 表述为与 finalize
    同样的自动提交、context unavailable 修复指引 MUST 覆盖 index stale 与 chat model 未设双分支、引用不存在的 JSON 字段 MUST NOT
    出现;propose「写 tasks.md」一节与 apply「勾选」一节 MUST 含约束句——tasks.md 只列实现与验证任务,收口(change finalize/change
    archive)是流水线步骤 MUST NOT 列为任务;apply 模板 MUST 含门禁证据约束句——harness 证据 MUST 来自真实 harness(声称 harness 合格 MUST
    已用显式 `--check`,缺省结构门的通过不是 harness 通过、harness 失败 MUST 先查根因)、编辑与验证 MUST 串行(MUST NOT 同批并行工具调用)、
    前后对比类判据 MUST 在 change 分支上测量、重构类 task MUST 对比测试用例数,并 MUST 含验证阶梯(unit → 定向 BDD → `validate --check` →
    finalize)引导;verify 模板 MUST 含审查者亲自复跑门禁(经 `--check --strict` 取得真实 harness 证据,MUST NOT 采信实现者报告,不符为
    CRITICAL,harness 证据 MUST 经 `--check`)与前后对比测量位置核对;propose「写 tasks.md」一节 MUST 要求前后对比类完成判据注明在 change 分支上测量;对账 MUST 以自动门禁纳入 bun
    test 套件(随 qa 运行),以禁用模式与必含标记声明(模式 MUST 覆盖已移除命令 checkpoint/change
    delta/feature_delta/solidify/project import 与已删除旗标及修饰符),违例 MUST 逐条报出来源模板与违例原因,缺失必含标记 MUST
    同样报出模板与缺失标记;对账面为 packages/core/templates/** 模板源头,渲染产物与 golden
    基线为下游,模板字面对账不在下游重复设门(仓库自带产物的新鲜度比对是独立门禁,见 r80)。apply 与 verify 模板(zh-Hans 与 en)MUST 声明 opt-in
    harness 语义:`validate` 缺省不执行 harness、声称全量 harness 证据 MUST 经显式 `--check`、缺省结构门的通过不是 harness 通过、收口会执行已配置的
    `specs.check_command` 因此收口前不必再跑一遍该命令。

    场景: 指引语义对齐门禁通过
      假如 工作目录是仓库根
      当 执行命令 "bun test tests/unit/template-guidance-parity.test.ts"
      那么 退出码为 0

  @req:r71
  规则: authoring helpers 撰写引导
    propose 撰写引导 MUST 将 spec authoring helpers 声明为结构化新增首选(next-req-id 全局 id 分配、add-req/add-scenario
    追加规则与验收、skeleton 新建 capability、resolve-req 反查),手改 .feature MUST 保留为逃生门;引导 MUST 在 zh-Hans 与 en 双
    locale 模板中同语义存在。

    场景: authoring helpers 引导入渲染产物
      假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
      当 渲染 propose skill 与 validation-hints 单元
      那么 zh-Hans 与 en 产物均含 authoring helpers 引导标识

  @req:r80
  规则: 仓库自带 skills 新鲜度
    本仓库已提交的 `.agents/skills` 中 `llman-sdd-` 前缀产物 MUST 与 golden 基线 zh-Hans
    集(tests/golden/baseline/skills)版本号归一化后一致,非该前缀的目录 MUST NOT 参与比对;比对 MUST 随
    check:skills-template-render(qa)运行,比对前 MUST 断言仓库 llmanspec/config.yaml 的 locale 与 specs.check_command(或经兼容提升等价的旧 bdd 配置)与
    golden 等价 config 一致;失败 MUST 报出差异文件名并区分缺失、多余与内容不同,且 MUST 提示运行 `init --update`。

    场景: 仓库自带 skills 与基线一致
      假如 工作目录是仓库根
      当 比对仓库自带 skills 与 golden 基线
      那么 自带 skills 比对无差异


    场景: 自带 skills 过期被报出
      假如 仓库自带 skills 的临时副本中 "llman-sdd-quick/SKILL.md" 被改动
      当 比对该副本与 golden 基线
      那么 比对报出 "llman-sdd-quick/SKILL.md" 为内容不同
      而且 仓库工作区未被改动
  @req:r93
  规则: init 逐根与 agent 面 skills 策略
    init MUST 保持逐根构造(init [path] 定根、路径根相对、无嵌套守卫,scope 重叠由路径单一归属 validate 把关);子根 init 照写 AGENTS.md 与 llmanspec/AGENTS.md 双托管块(marker 更新保留既有内容)。.agents/skills 仅当目标为仓库根实例时注入:子根 init 缺省 MUST NOT 注入 skills 且 MUST NOT 清理 skills 命名空间,--skills 旗标显式开启子根注入。init --update MUST 复用根发现算子刷新全部发现根的托管块,skills 渲染与 llman-sdd-* 命名空间清理仍仅作用于仓库根实例。

    场景: 子根 init 缺省不注入 skills
      假如 一个 git 仓库的临时目录
      当 运行 init packages/tui 与 init packages/tui --skills
      那么 子根双托管块写入且缺省无 .agents/skills 且 --skills 后注入
