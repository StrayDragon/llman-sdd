# Tasks

测试接缝(seam):复用既有 seam——`buildReview` 纯函数(临时 specs fixture + 注入 activeChanges,单测 `tests/unit/review.test.ts`),不发明新 seam;detail 文案不受 feature 合约钉死,无需新增 BDD 场景(既有 r23 形状场景继续覆盖形状不变)。

- [ ] T1: 单测先行(红)——`tests/unit/review.test.ts` 新增 validate 信号 detail 三分流用例:仅 sweep 失败(detail 含 `validate --all` 指引且命令名为 `llman-sdd`);仅 strict 失败(detail 点名 change id 与未勾选数,且不含 `validate --all failed`);sweep 与 strict 兼有(两者合并报出) [blocked-by: 无]
- [ ] T2: 实现(绿)——`review.ts` 将 sweep 失败与 strictChangeFails 分开收集,validate detail 按来源分流;`locked` detail 命令名残留 `llman sdd` 改 `llman-sdd` [blocked-by: T1]
- [ ] T3: 门禁全绿 + 端到端冒烟——`just qa`、`llman-sdd validate --all --strict --no-interactive`;临时仓库构造含未勾选 tasks 的 active change,spawn CLI 断言 `review` 输出点名该 change 且不再出现误导指引(复用 BDD steps 临时仓模式,仅作验证不改 feature) [blocked-by: T2]
