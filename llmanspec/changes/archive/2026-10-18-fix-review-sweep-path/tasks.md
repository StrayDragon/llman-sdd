# Tasks: fix-review-sweep-path

测试 seam(沿用本会话定案:双 seam)——`tests/unit` 直测 core 纯函数 +
既有 Gherkin→bun:test runner(`tests/bdd/`,真实 CLI 子进程)。

- [x] t1 spec id 推导路径形态无关(core)
  - `packages/core/src/spec/assignSpecIds.ts` 的 `featureRelPath` 后缀感知:
    specsDir 前缀不中时,按路径段边界定位 specsDir 在 fileName 中的末次
    出现并取其后段;无命中维持现状。纯函数,零持久化。
  - 单测:绝对 entries + 缺省相对 specsDir → id = 文件基名;嵌套宿主目录
    取末次;既有相对输入不变(逐字节)。
  - 验证:`bun test tests/unit/<相关>`。

- [x] t2 review 判定一致性契约落地(specs + BDD)
  - validation capability 追加可执行场景:绝对路径 entries 经
    `validateAllSpecs` 判 OK(id = 基名,与 `功能:` 标题一致)。
  - review 所在 capability 追加条款与场景:同一临时仓中 `review` 的
    validate 信号与 `validate --all` 同判定(同绿同红),`review` 退出码 0。
  - 验证:`bun test tests/bdd -t "review"` → `llman-sdd validate --specs`。

- [x] t3 全量门禁与前后对比([blocked-by: t1, t2])
  - main 基线:review criticalCount = 全 specs 数(先在全红);本分支:
    criticalCount 仅来自真实信号,validate 信号非全红。
  - 验证:`just qa` + `llman-sdd validate --check --strict` 全绿。
