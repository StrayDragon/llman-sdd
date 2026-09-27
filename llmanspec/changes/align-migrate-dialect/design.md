# Design

## 方案取舍(issue 给出三个选项)

- **选定:按源方言输出关键字(选项 2)+ 产物解析自检兜底(选项 3)**。
- 否决「归一为 zh-CN」(选项 1):skeleton 已按仓库 locale 本地化(r7 合约:en locale → `# language: en`),迁移若强制归一 zh-CN 会与 en-locale 下游仓库的自身约定冲突;保持源方言严格更通用,想归一的仓库可另行处理。
- 自检兜底是本修复的硬保证:无论未来渲染逻辑如何演化,`migrate-native` 不可能再静默产出不可解析文件——这正是 issue 的核心症状(静默成功 + 事后 validate 才炸)。

## 方言解析与关键字映射

- 源方言 = `parseFeatureSource()` 已解析出的 `language`(en 起步、zh-CN 回退的既有兜底链,r7);`analyzeLegacy()` 原本丢弃该值,现携带到渲染层。解析本身失败即迁移失败,不存在「解析方言未知还要渲染」的状态。
- 映射只覆盖 `en` 与 `zh-CN` 两个值——兜底链决定了这是仅有的两个可达方言;其他语言源在 `analyzeLegacy()` 解析阶段即报错,进不到渲染。
- 前言原样保留即可保持一致:en 方言源的前言是 `Feature:`,zh-CN 源是 `功能:`,与所选关键字天然匹配,无需改写 preamble。

## 解析自检

- 渲染完成后对产物跑一次 `parseFeatureSource()`,失败 → `ok:false`(消息含解析错误),不产出 content 供写入。
- **失败分支不可从合法 legacy 输入构造**:产物 = 原样前言(源已可解析)+ 按方言生成的块头/标签 + 源逐字步骤,全部与解析方言一致。自检是对未来回归的 fail-closed 防御(如后续改动引入方言错配、preamble 处理变化),合约以 MUST 表述;单测/BDD 只能覆盖成功路径,不可构造性在此记录,不视为测试缺口。

## 不做的事

- 不改 CLI 命令面、退出码、交互确认(自检失败走既有 `!result.ok` → `[error]` 分支,文件不写)。
- 不改 `migrations/v0.4-v0.5/` 历史脚本(已消费的一次性工具)。
- 不引入 locale 配置管道(纯函数保持纯,方言来自源文本自身)。

## 测试边界

- 单测:tests/unit/spec.test.ts 既有 describe 内新增 en 方言 roundtrip(issue #3 MVP 输入)与 zh-CN 回归断言。
- BDD:tests/bdd/steps/parse.ts 复用 change A 的 when 步骤「迁移该 feature 为原生格式」,新增 en/zh given 与方言断言 then,绑定 r88 两个场景。
