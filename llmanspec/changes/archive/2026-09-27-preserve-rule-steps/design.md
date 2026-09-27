# Design

## 渲染决策

- **自动嵌套场景标题固定为 `验收示例`**:单个 legacy 规则场景恰好产出一个自动嵌套场景(标题来源场景已升格为规则标题,不可复用);legacy 格式无嵌套场景,同批迁移内不可能与既有场景撞名。多语言措辞随方言 change(issue #3)另行参数化,本 change 维持 zh-CN。
- **位置紧跟描述行之后、既有归属验收之前**:步骤与描述同源于一个 legacy 场景块,按文件顺序语义它就是该规则的第一份验收;其余归属验收来自后续块,排在其后。
- **`@skip` 继承**:legacy 规则场景的 `@skip` 在规则块渲染中本就不落(现状),落到自动嵌套场景上可保留「该验收不参与执行」的原始意图,且不引入规则块级 @skip 的新形态。
- **计数如实**:自动嵌套场景计入 `scenarios` 返回值,`[migrate]` 摘要行无需改动即可反映。

## 不做的事

- 不改 CLI 命令面、退出码与交互确认流程(纯函数行为变化自然透出)。
- 不处理源方言与关键字一致性( issue #3,独立 change)。
- 0.5.0 已迁移仓库的步骤丢失不可由工具恢复(hasNativeRules 对 native 文件 skip),只在 proposal Impact 记录,不做反向迁移工具。

## 测试边界

- 单测:tests/unit/spec.test.ts 既有 `migrateNativeSource roundtrip` describe 内新增同体形态用例(输入 = issue #2 MVP)。
- BDD:tests/bdd/steps/parse.ts 新增步骤绑定,驱动 `migrateNativeSource()` 公共 API,绑定 r65 两个场景。
