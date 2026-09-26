# Tasks

> Seam：所有断言走既有测试轮廓：
> - 纯域：直接调 `@llman-sdd/core` 的 `runFreeze`/`runList`/`runThaw`/`freezeCandidates`/`resolveChangeRef`/`collectArchivedNodes`（IO 经 `FreezeIo`/`GraphFsIo` 注入，可内存 mock）
> - 端到端：`tests/helpers/spawn.ts runCli` + `tests/bdd/steps`（makeTempRepo 剥离嵌套守卫）
> - 7z 能力：7z-wasm 打包依赖，缺失时 BDD 场景按既有环境守卫快失败
>
> 基线类断言（如需对比）在 change 分支上相对 merge-base 测量。

- [ ] T1: freeze 生成平铺卡替代目录——`runFreeze` 在 7z add 成功后写 `<date>-<id>.yaml`（frontmatter 原样 + frozen 段：时间戳/文件清单/sha256）并删除原目录；7z add 失败时回滚卡、保留原目录。（freeze.ts + 单元测试：卡存在即正文在冷备、卡内容回读 frontmatter 一致）
- [ ] T2: thaw 校验并回置——`runThaw` 校验卡存在 → 解出正文 → sha256 校验 → 回置目录 → 删除卡。（freeze.ts + 单元测试：冻→解双向、卡在 thaw 后被移除）
- [ ] T3: freeze 候选筛选排除已冻结条目——`freezeCandidates` 仅选带正文的日期目录（已存在平铺卡的日期不再入选）。（freeze.ts + 单元测试）
- [ ] T4: `freeze --list` 改读平铺卡——枚举 `.yaml` 卡而不是解析 7z；无卡时不依赖 7z 也可报告。（freeze.ts + 单元测试 + CLI 冒烟）
- [ ] T5: graph archived 节点识别平铺卡——`collectArchivedNodes` 将 `<date>-<id>.yaml` 采集为 archived 节点（与目录条目去重、id 提取一致）。（graph/nodes.ts + 单元测试）
- [ ] T6: 依赖解析识别冻结 id 为 `archived`——`resolveChangeRef` 对平铺卡命中返回 `archived`（修复「冻结后 depends_on 跌入 unknown」回归）。（changeCheck.ts + 单元测试）
- [ ] T7: graph `proposalFor`/归档内容回退——目录缺失时读 `<date>-<id>.yaml` 展示 frontmatter。（graph/nodes.ts + 单元测试）
- [ ] T8: validate 全局 id 唯一性门禁——枚举活跃 + 归档目录 + 平铺卡断言 id 全集唯一，冲突报 ERROR。（changeCheck.ts + 单元测试 + BDD 场景）
- [ ] T9: 存量兼容——既有 `freezed_changes.7z.archived` 条目仍可列表、thaw 回置目录，与新形态并存不冲突。（freeze.ts + BDD/单元回归）
- [ ] T10: BDD 场景落地——review-freeze r24/r25 修订 + validation 唯一性 + peripheral graph 场景按新行为更新，`bun test tests/bdd` 通过。（tests/bdd/steps + .feature）
- [ ] T11: 模板与 skills 同步——`archive-freeze-guidance.md`、`llman-sdd-archive.md` 等文案更新并 `init --update` 刷新 `.agents/skills`，skills-template-render 门通过。
