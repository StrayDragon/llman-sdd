# Tasks:release-v2-and-cutover

测试边界(seam)声明:全部复用既有 harness——BDD runner 步骤(tests/bdd/steps/*,改写既有场景的步骤实现,不发明新 seam)、golden 脚本骨架(tests/golden/lib.ts 的 runCapture/normalizeCliText)、CLI 子进程 spawn。临时对拍为独立脚本,拆门时随之删除。

- [x] T1 specs 承接改写(BDD 场景 v2 自承接)
  - 实现 Specs landing 后的场景步骤:`review-freeze` 冻结解冻自洽(v2 freeze→thaw roundtrip,替代 v1 冻结前置);`peripheral-commands` 输出结构合法(list JSON 字段/枚举断言 + graph 首行断言,替代 v1↔v2 对照)
  - 移除 `tests/bdd/run.test.ts` 的 HAS_V1/V1_PARITY_SCENARIOS 跳过机制(domain.ts 中不再有 v1 步骤)
  - 门:bun test 全绿(BDD 对全部 @executable 场景可执行)

- [x] T2 临时对拍扩充(v1 在场,临时门) [blocked-by: T1]
  - `scripts/temp-parity-v1.ts` + justfile `parity-v1-temp`:change 全子命令(临时仓)、fresh init 双栈产物对照(记录 AGENTS.md 托管块分歧)、freeze/thaw 全参数、review --export-html、context 守卫/错误路径
  - 复用 lib.ts runCapture/normalizeCliText;结果与漂移记录进 `docs/acceptance-v2.md` 临时章节
  - 门:扩充矩阵全绿(发现漂移即修后重跑)

- [x] T3 发布工程(本地就绪,不外发)
  - npm 包布局:单包 `llman-sdd`,bin 指向 apps/cli/src/main.ts,engines(bun>=1.4 || node>=24),files 白名单;`npm pack` 干跑验证内容集
  - `--compile` 二进制矩阵本地构建冒烟(linux x64 至少一平台)+ sha256
  - `.github/workflows/release.yml`:tag 触发,fetch-depth: 0,构建 matrix + sha256 + smoke,产物挂 release(仅落盘配置,不触发)
  - 门:`npm pack` 内容清单正确;二进制 `--version` 注入正确

- [x] T4 狗粮切换(本仓库 init --update) [blocked-by: T1]
  - 执行 `bun apps/cli/src/main.ts init --update`;验收:skills 与切换前零漂移(golden:check 仍绿)、两个 AGENTS.md 托管块完整且块外内容保留、v1 流水线命令(list/validate)仍可用
  - 证据链记入 `docs/acceptance-v2.md`

- [x] T5 拆除 v1 对拍门(SSOT 收口) [blocked-by: T2, T4]
  - 删除 tests/golden/check-cli.ts、check-validate.ts 及 package.json/justfile 入口;`temp-parity-v1.ts` 删除
  - golden:check 基线重采:generate.ts 改调 v2 runInit,`tests/golden/baseline/` 成为 v2 自有快照(VERSION 标记保留)
  - README 门禁表与 `docs/acceptance-v2.md` 改写为纯 v2 口径(临时章节转正式记录)
  - 门:just qa + golden:check(v2 基线)全绿;仓库内 `grep -r "golden:cli\|check-validate"` 零残留

- [ ] T6 去 v1 化清理清单 [blocked-by: T5]
  - `packages/core/templates/` 模板 v1 措辞审计(改动同步刷新基线)
  - `project migrate` stub 文案改写(去 v1 指引,与 r22 修订后合约一致)
  - 代码注释出处标注审计(可选保留工程史实);README/AGENTS 验收条款措辞对齐
  - 门:just qa + golden:check 全绿;`grep -rn "Rust llman\|v1 冻结\|v1 生成物" packages/ apps/ llmanspec/specs/` 仅剩设计裁决记录

- [ ] T7 发布执行(外发,需用户显式指令) [blocked-by: T3, T5, T6]
  - 确认包名(默认 `llman-sdd`)与 llmanspec alias 决策(默认首发不做)后:打 tag push → release workflow 跑通 → npm publish → 发布物下载冒烟 + sha256 核对
  - 门:release 页产物齐全;`npm install llman-sdd && llman-sdd --version` 通过
