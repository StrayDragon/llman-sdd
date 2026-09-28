# Design

## 统一口径与实现位置

判定顺序(用户定向):`# language:` 头注释 > 自动发现 > en。落在 `parser.ts` 导出 `sourceDialect(source)`,理由:

- 自动发现一步就是「语言兜底链」本身——`parseFeatureSource` 的 en 起步、zh-CN 回退已在 r7 合约内,直接复用其返回的 `language`,不为 authoring 另设 `功能:` 探测;
- parser.ts 已持有兜底链,无新增模块边(spec 模块内),不引入 keywords ↔ parser 循环导入(keywords.ts 依赖官方表,parser.ts 依赖解析器,判定函数归解析侧);
- migrate/authoring/skeleton 三类调用方统一引用:头注释存在(含未知名)原样采用,调用方 `officialKeywordsOrEn` 把未知名落到 en 关键字;migrate 的产物解析自检对「未知名头 + en 关键字产物」天然 fail-closed(未知语言头使官方解析器报错),破损输入不会静默落盘。

## 行为等价性

- migrate:原 `sourceDialect(source, resolved)` = 头 > 链解析结果;链失败在 `analyzeLegacy` 更早抛错,故共享函数的 en 兜底分支在该路径不可达——行为不变。
- authoring:原 `dialectOf` = 头 > `功能:` 探测 > en。共享函数对全部可解析输入给出相同结果(无头 zh 经链判 zh-CN,无头 en 判 en);对无头且不可解析文件,探测路径得 en,共享路径抛错被捕获后同为 en——行为不变。差异仅存在于「含 `功能:` 字样但整体不可解析」的破损文件(原判 zh-CN,现统一判 en),该输入本就无从谈起正确方言,以统一口径为准。

## 不做的事

- 不校验头值是否在官方词表(判定与词汇选取分层:判定归 sourceDialect,词汇归 officialKeywordsOrEn;破损头由 migrate 自检兜底)。
- 不改 skeleton(生成新文件,方言来自仓库 locale 映射,r7;与「读既有文件判方言」是两个问题)。
- 不新增 specs 规则块:统一口径写入 r41/r88 既有括注,行为无新增 MUST。

## 测试边界

- 单测:tests/unit/spec.test.ts 新增 `sourceDialect` describe(头优先/无头 zh/en 自动发现/garbage → en/未知名头原样返回)。
- 回归:既有 276 单测 + 168 BDD 全量零漂移即等价性证据。
