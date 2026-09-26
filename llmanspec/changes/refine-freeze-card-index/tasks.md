# Tasks

> Seam：所有断言走既有测试轮廓：
> - 纯域：直接调 `@llman-sdd/core` 的 `runFreeze`/`runList`/`runThaw`/`freezeCandidates`/`proposalFor` 等（IO 经 FreezeIo/GraphFsIo 注入，可内存 mock）
> - 端到端：`tests/helpers/spawn.ts runCli` + `tests/bdd/steps/meta-foundation.ts`（makeTempRepo 剥离嵌套守卫）
> - 7z 能力：7z-wasm 打包依赖，缺失时 BDD 场景按既有环境守卫快失败
>
> 迁移类断言（存量 50 卡重生成）在 change 分支上执行并提交，作为合并后 main 的真实样本。

- [ ] T1: freeze 卡生成只写 title + depends_on——`runFreeze` 提取 proposal.md H1 为 `title`、frontmatter 的 `depends_on`（保留流式/块式原样值），不再写其它字段与 `frozen:` 段。（freeze.ts + 单元测试：回读卡断言仅含 title/depends_on、卡为 fenced YAML）
- [ ] T2: thaw 移除 sha256 文件级校验——`runThaw` 保留「卡存在即正文在冷备」的权威语义（缺卡报错），但回置前不再比对 sha256、不再读文件清单；回置后删除卡。（freeze.ts + 单元测试：冻→解双向、卡删除）
- [ ] T3: `frozenCard.ts` schema 裁剪——移除 FrozenMeta/FrozenFileEntry/parseFrozenCard 的 frozen 段，卡生成/解析仅处理 title+depends_on；清理死导出与模块对账表（若边变化）。（frozenCard.ts + 单元测试 + module-dependency-parity）
- [ ] T4: graph/依赖解析不回归——`proposalFor` 从新卡读 depends_on 解析依赖边（`collectArchivedNodes`/`resolveChangeRef` 仍按文件名识别，确认不读已删字段）。（report.test.ts + validation.test.ts 回归）
- [ ] T5: BDD 场景更新与新 schema 断言——meta-foundation 的 freeze 卡/thaw 卡场景改为断言卡仅含 title/depends_on、thaw 无 sha256 校验；`bun test tests/bdd` 全绿。（tests/bdd/steps/meta-foundation.ts + .feature）
- [ ] T6: 存量卡迁移——本仓库已冻结的 50 张卡按设计路径 A（thaw 全部 → 新 freeze 重冻结）重新生成，提交迁移后仅含 title/depends_on 的卡；7z 冷备内容不变。（真实仓库操作 + 验证）
- [ ] T7: 模板与 skills 同步——`archive-freeze-guidance.md` 卡格式描述更新并 `init --update` 刷新 `.agents/skills`，skills-template-render 门通过。
