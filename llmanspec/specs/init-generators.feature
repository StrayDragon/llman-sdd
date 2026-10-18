# language: zh-CN
# purpose: 定义模板渲染语义、locale 兜底链、init 产物面与 skills 命名空间治理,验收基准为渲染基线归一化 diff。

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
    locale MUST 先归一化:zh 前缀(zh/zh-cn/zh-hans)、en 前缀、空值与未知取值一律归一为内置默认 `zh-Hans`(项目 config 显式
    `locale: en` 亦归一为 zh-Hans);回退链 MUST 为 [归一化值, 语言主部, zh-Hans] 去重序列,链尾 MUST 为内置默认 zh-Hans;
    单元资源 MUST 按 unit 级独立回退(首个命中 locale 生效)。

    场景: locale 兜底链可执行验收
      假如 locale 输入集与双语资源桩
      当 计算 locale 归一化、回退链与资源回退
      那么 zh 与 en 前缀、空值与未知取值均归一为 zh-Hans
      而且 回退链为去重的归一化值语言主部与 zh-Hans 序列
      而且 资源按 unit 级独立回退且首个命中 locale 生效

  @req:r19
  规则: init 产物面与命名空间治理
    `init` MUST 产出 llmanspec/config.yaml(含 $schema 头行与 locale 缺省)、specs/.gitkeep、
    changes/archive/.gitkeep,并以托管块方式写根与 llmanspec 的 AGENTS.md(已有内容保留);`init --update` MUST 渲染默认 10 个
    skills 加 extra_skills 扩展到 `.agents/skills/<stem>/SKILL.md`,且 MUST 仅清理 `llman-sdd-`
    前缀内候选集外的目录;每个渲染产物 MUST 通过 ethics 治理门(5 个 ethics 键齐全)。渲染产物与 golden
    基线(tests/golden/baseline/)的版本号归一化比对 MUST 覆盖内置 zh-Hans locale,且 MUST 随 bun test 套件运行;比对失败
    MUST 报出差异文件名并区分缺失、多余与内容不同。

    场景: 渲染与基线归一化一致
      假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
      当 渲染全部 skills
      那么 与 golden 基线归一化版本号后 diff 为空
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
  规则: init locale 选项别名与生效 locale 优先级链
    `init` MUST 接受 `--lang <locale>` 作为 `--locale` 的别名(渲染语义完全等效);两者同给 MUST 报错。
    渲染生效 locale MUST 按 `工作区 config 显式 locale 键 > CLI 选项 > 内置默认 'zh-Hans'` 解析;config.yaml 缺失时 MUST 生成 config
    并取 `CLI 选项 > 内置默认` 写入 locale;每个 workspace 实例 MUST 独立解析生效 locale,实例间不继承。
    既有 config.yaml 无显式 `locale` 键时,init 与 `init --update` MUST 输出 WARNING 指明实际回退值与修复路径(补键或显式传选项)。

    场景: lang 别名等效
      假如 一个空的临时工作区
      当 运行 init --lang zh-Hans
      那么 config locale 为 zh-Hans 且同给两个别名报错

    场景: update 时工作区 config locale 压制 CLI 选项
      假如 一个 locale 为 zh-Hans 的已初始化工作区
      当 运行 init --update --locale en
      那么 根 AGENTS.md 托管块仍为 zh-Hans 渲染且 config locale 保持 zh-Hans

    场景: config 缺 locale 键时 CLI 选项生效并告警
      假如 一个 config.yaml 无 locale 键的已初始化工作区
      当 运行 init --update --locale zh-Hans
      那么 根 AGENTS.md 托管块为 zh-Hans 渲染且 stderr 含缺键 WARNING

    场景: config 缺 locale 键且无选项时回退内置并告警
      假如 一个 config.yaml 无 locale 键的已初始化工作区
      当 运行 init --update
      那么 根 AGENTS.md 托管块为 zh-Hans 渲染且 stderr 含缺键 WARNING

  @req:r66
  规则: spec 撰写配对引导判据
    skills 撰写引导(单轨 feature 撰写节与 tag 语法节)MUST 含「可执行场景优先」判据并附带使用示例:凡 GWT(假如/当/那么)可表达、
    绑定步骤代码的自动化判定行为 MUST 落成 `场景:`(原生 gherkin 鼓励形态);仅当需求无法程序化表达(抽象目标、架构决策、
    治理/人工约束)或暂不转写时,才以 `规则:` 块承载需求并在 proposal/design 记录理由;无法配可执行场景的裸 `规则:`
    由聚合计数与 specs-compact 承担压降。历史标签(@executable/@rule/@human/@manual)不再教学。判据与示例 MUST 在内置 zh-Hans
    模板中存在。

    场景: 配对判据入渲染产物
      假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
      当 渲染 propose skill 与 validation-hints 单元
      那么 产物含「可执行场景优先」判据小节标识与使用示例
      而且 zh-Hans 产物含该判据

  @req:r70
  规则: 模板指引语义对齐
    模板 skills 与 units(内置 zh-Hans)中对 CLI 的行为性指引 MUST 与实际值域与行为一致:review 人审检查点 MUST
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
    基线为下游,模板字面对账不在下游重复设门(仓库自带产物的新鲜度比对是独立门禁,见 r80)。apply 与 verify 模板(zh-Hans)MUST 声明 opt-in
    harness 语义:`validate` 缺省不执行 harness、声称全量 harness 证据 MUST 经显式 `--check`、缺省结构门的通过不是 harness 通过、收口会执行已配置的
    `specs.check_command` 因此收口前不必再跑一遍该命令。模板源头 MUST 自洽:围栏代码块之外的行加粗标记 MUST 成对(`**` 计数为
   偶数),违例 MUST 报出来源模板与行号;模板中以 `# language:` 头声明的示例块 MUST 能被本仓 spec 解析器解析,违例 MUST 报出来源模板与解析错误;
   `UNIT_FILES` 的每个单元 MUST 至少被一处模板 `unit("<id>")` 引用,未被引用的单元 MUST 报出。三面 MUST 以自动门禁纳入 bun
   test 套件(随 qa 运行),违例 MUST 逐条报出,且 MUST 以可独立调用的辅助函数覆盖人工植入的缺陷样本(奇数 `**`、不可解析示例、未引用单元)。

    场景: 指引语义对齐门禁通过
      假如 工作目录是仓库根
      当 执行命令 "bun test tests/unit/template-guidance-parity.test.ts"
      那么 退出码为 0

  @req:r71
  规则: authoring helpers 撰写引导
    propose 撰写引导 MUST 将 spec authoring helpers 声明为结构化新增首选(next-req-id 全局 id 分配、add-req/add-scenario
    追加规则与验收、skeleton 新建 capability、resolve-req 反查),手改 .feature MUST 保留为逃生门;feature-contract 与 skeleton 引导 MUST 声明 capability 即 discover 分配后的 spec id、等于 `功能:` 标题,MUST NOT 要求或生成 `# capability:` 头;引导 MUST 对使用者可见:算出的指引文本
    MUST 声明该约定,MUST NOT 依赖不会被 init 落盘到使用者仓库的单元文本;引导 MUST 在内置 zh-Hans 模板中存在。

    场景: authoring helpers 引导入渲染产物
      假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
      当 渲染 propose skill 与 validation-hints 单元
      那么 zh-Hans 产物含 authoring helpers 引导标识

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
    init MUST 保持逐根构造(init [path] 定根、路径根相对、无嵌套守卫,根间重叠不做交叉校验);子根 init 照写 AGENTS.md 与 llmanspec/AGENTS.md 双托管块(marker 更新保留既有内容)。.agents/skills 仅当目标为仓库根实例时注入:子根 init 缺省 MUST NOT 注入 skills 且 MUST NOT 清理 skills 命名空间,--skills 旗标显式开启子根注入。`init --update` 在任意实例根上运行 MUST 复用根发现算子刷新全部发现根的托管块(per-workspace,不限于仓库根目标),skills 渲染与 llman-sdd-* 命名空间清理仍仅作用于仓库根实例。
    托管块 marker 更新契约:START 与 END 双标记齐且有序时 MUST 原位替换块体(标记外既有内容保留);END 先于 START MUST 报错;标记缺失时 MUST 将整块前置插入。

    场景: 子根 init 缺省不注入 skills
      假如 一个 git 仓库的临时目录
      当 运行 init packages/tui 与 init packages/tui --skills
      那么 子根双托管块写入且缺省无 .agents/skills 且 --skills 后注入

    场景: 子根 update 刷新全部发现根托管块
      假如 一个含根实例与子根实例的 git 仓库且两实例托管块均被篡改
      当 在子根运行 init --update
      那么 根实例与子根实例的托管块均恢复为当前模板渲染且子根仍无 .agents/skills

    场景: 托管块 marker 更新契约
      假如 含双标记的 AGENTS.md 内容样例集(块体可替换、END 先于 START、标记缺失)
      当 逐样例执行块体更新
      那么 双标记有序样例块体被替换且标记外内容保留、逆序样例报错、缺失样例整块前置插入

  @req:r97
  规则: 模板强度词汇表唯一与 check-stc 文风门
    模板 skills 与 units 的指令强度词汇在同一语言内 MUST 唯一:zh-Hans 模板正文要求级只用 必须/不得、推荐级只用 宜/不宜、允许级只用 可/不必、能力级只用 能/不能,禁止以 MUST、SHALL、不要、禁止、勿、务必、应、建议 表达强度;引用 spec 合约原文的语句(如 specs 的 MUST/SHALL 逐条落实)保留被引对象词汇,豁免段以白名单正则维护于 template-guidance-parity 断言。zh-Hans 模板文风 MUST 经 check:stc 门禁守护:scripts/check-stc.ts 对 packages/core/templates/zh-Hans 逐文件执行 stc check --profile for-instruction-writing --json,errors 计数 MUST 不高于 scripts/stc-baseline.json 的 per-file 上限,基线只许随 change 下调;该门 MUST 随 qa 运行。语义正确性仍由 template-guidance-parity 与 golden 渲染门独立守护,check:stc 不得替代二者;误报经 stc-disable-next-line 行注释豁免并附理由。

    场景: check-stc 门禁与 MUST 边界断言通过
      假如 工作目录是仓库根
      当 执行命令 "bun run check:stc"
      那么 退出码为 0
      而且 模板文风门随 qa 聚合运行
  @req:r106
  规则: init 新建实例告警
    目标根不存在有效 llmanspec 实例而其祖先存在有效实例时,init MUST 输出 WARNING 指明将新建独立实例与最近既有实例的位置;祖先也不存在有效实例时 MUST NOT 告警。实例根判定 MUST 复用根发现算子的有效性判据(config.yaml 或 specs/ 子目录)。

    场景: 新建实例触发告警
      假如 一个根实例已初始化的 git 仓库
      当 在其空子目录运行 init packages/tui
      那么 packages/tui 成为新实例且 stderr 含指向根实例位置的 WARNING

    场景: 空白项目不告警
      假如 一个无任何 llmanspec 实例的空目录
      当 运行 init
      那么 stderr 无新建实例 WARNING 且实例正常创建
