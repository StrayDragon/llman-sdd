# Tasks: improve-cli-failure-next-steps

> 验收 Seam：① CLI 子进程夹具（`tests/helpers/` + `mkdtempSync`）覆盖无草稿 `--specs`、Next 行、not-found 候选、裸调无空 Error、help 默认值不重复；② `pickNotFoundCandidates` 单测固定排序。前后对比在 change 分支上相对 merge-base 测量。

- [x] T1 规格：`studio-cli` 增加无草稿降级与 `--specs`、错误带下一步规则；`cli` 增加 not-found 候选规则；`r134` 为 validate 开 0 草稿例外。场景用 CLI 子进程夹具。

- [x] T2 `[blocked-by: T1]` CLI：`pickNotFoundCandidates` / `formatNotFound`；`validate --specs` 与无草稿自动降级；diff/prompt/apply/revise 的 Next 行；空 `CliError` 不打印；help 默认值与 description；open/serve 启动一行。单测覆盖候选排序确定性。

- [x] T3 `[blocked-by: T2]` 旗标面：绑定分支 `init --update`，提交 `.agents/skills/` 与 golden；补 BDD 步骤。L1 定向单测 → L2 定向 BDD → L3 `validate --check` → 收口前 `just qa`。
