# language: zh-CN
# capability: init-generators
# purpose: 定义模板渲染语义、locale 兜底链、init 产物面与 skills 命名空间治理,验收基准为渲染基线归一化 diff。
# scope: packages/core/src/templates/, packages/core/src/init/, packages/core/templates/, apps/cli/src/, tests/golden/

功能: init-generators

  @req:r17 @human
  场景: 模板渲染语义
    - 模板变量 MUST 全部为字符串注入,未定义变量 MUST 渲染为空(Lenient);`unit(id)` MUST 递归展开对应单元内容(同环境同变量),嵌套深度 MUST 以 32 为上限,缺失 id MUST 报错;渲染产物 MUST 去除尾随空白,落盘时 MUST 以单一换行结尾。

  @req:r18 @human
  场景: locale 兜底链
    - locale MUST 先归一化(zh/zh-cn/zh-hans 前缀 → zh-Hans,en 前缀 → en,空值 → en),回退链 MUST 为 [归一化值, 语言主部, en] 去重序列;单元资源 MUST 按 unit 级独立回退(首个命中 locale 生效)。

  @req:r19 @human
  场景: init 产物面与命名空间治理
    - `init` MUST 产出 llmanspec/config.yaml(含 $schema 头行与 locale 缺省)、specs/.gitkeep、changes/archive/.gitkeep,并以托管块方式写根与 llmanspec 的 AGENTS.md(已有内容保留);`init --update` MUST 渲染默认 10 个 skills 加 extra_skills 扩展到 `.agents/skills/<stem>/SKILL.md`,且 MUST 仅清理 `llman-sdd-` 前缀内候选集外的目录;每个渲染产物 MUST 通过 ethics 治理门(5 个 ethics 键齐全)。

  @req:r19 @executable
  场景: 渲染与基线归一化一致
    假如 本仓库的等价 config(zh-Hans 与 bdd 配置)
    当 v2 渲染全部 skills
    那么 与 golden 基线归一化版本号后 diff 为空
    而且 每个 SKILL.md 通过 ethics 治理门

  @req:r49 @human
  场景: init 目标路径
    - `init [path]` MUST 支持位置参数指定目标目录(相对或绝对,不存在 MUST 自动创建),全部产物(llmanspec/、根 AGENTS.md、.agents/skills/)MUST 落在该目录下;缺省 MUST 为当前目录。

  @req:r50 @human
  场景: init locale 选项别名
    - `init` MUST 接受 `--lang <locale>` 作为 `--locale` 的别名(渲染语义完全等效);两者同给 MUST 报错。

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
