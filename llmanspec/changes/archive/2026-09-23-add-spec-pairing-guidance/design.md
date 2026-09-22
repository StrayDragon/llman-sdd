# Design: spec 撰写配对引导

## 决策 1:判据写在模板两层而非仅 validation-hints

propose 4b 是撰写现场(写 spec 时必读),validation-hints 是校验排错现场(修 tag 报错时必读)——两处都要有判据,否则只在排错时被看见。四文件内容保持语义一致,locale 各自成文。

## 决策 2:合约钉「判据存在性」而非逐字

r66 executable 断言渲染产物含判据小节标识(「@human/@executable 分流判据」标题),不钉全文——措辞迭代自由,存在性由合约保证;字节级回归由 golden 基线(r19)兜底。

## 决策 3:不做校验器信号

review 的 pending 信号已计量「规则无匹配验收」,再在 validate 加一级信号属重复通道;模板引导 + golden 字节门已闭环。校验器信号登记为遗留项,若日后 pending 计量被忽略再议。

## 权衡

- 备选「仅改 .agents/skills(运行副本)」被否:.agents 是模板渲染产物,改产物不改模板,下次 init --update 即回退——模板是 SSOT。
- 备选「把判据写进 AGENTS.md 托管块」被否:托管块由 init --update 刷新,面向全项目通用规则,而判据是 skill 撰写引导,归模板管。
