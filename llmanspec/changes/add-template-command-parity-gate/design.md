# Design: 模板命令对账门禁

## 取舍:命令面探测方式

- **选定:spawn `--help` 探测**——对每条引用的命令路径跑 `bun apps/cli/src/main.ts <path> --help`(utf8),退出码非 0 = 路径不存在;help 文本不含该 `--flag` = 旗标不存在。
- 否决:import commander program 树——`apps/cli/src/main.ts` 是带顶层副作用(side effect 注册+parse)的入口脚本,非导出面;为测试改其导出形态属面外重构。
- 否决:硬编码命令树——CLI 演进时双处维护,恰是本门禁要消灭的漂移形态。
- spawn help 的自适应性是决定性的:CLI 加旗标时门禁自动放行,模板引用不存在的旗标时自动拦截,单边 SSOT(main.ts)。

## 扫描算法

1. 递归收集 `packages/core/templates/{zh-Hans,en}/{skills,units}/**/*.md`(渲染产物 `.agents/`、golden 基线不扫——它们是模板的下游,源头干净即下游干净)。
2. 行级正则提引用:`llman-sdd` 后取路径 token(跳过 `<placeholder>`、含 `/` 的简写、`|` 管道后内容),再收集行内全部 `--flag`。
3. 去重(路径+flag)后逐条探测;路径探测按「先长后短」:先试 `w1 w2 --help`,失败回落 `w1 --help`,仍失败 = 未知命令违例。
4. 违例清单非空 → `throw`,消息逐条 `[模板文件] 引用 → 原因`;空 → pass。

## 已知不校验面(显式不做)

- 旗标**值域**与语义(`--output json` 的 token 合法性、参数形态)——help 文本无法可靠反推,误报风险高;
- 无命令前缀的散文旗标引用(如「用 `--json`」)——无法定位宿主命令;
- 模板控制语法(`{{ unit(...) }}`、`{% if %}`)内不含命令引用,天然不冲突。

## Seam(测试接缝)

三层全复用既有通道,零新接缝:
1. 对账测试本身:`spawnSync`(tests/integration/binary.test.ts 既有模式)驱动源码 CLI;
2. @executable 场景:tests/bdd runner 既有 smoke steps(假如 工作目录是仓库根 / 当 执行命令 / 那么 退出码为),场景命令 = `bun test tests/unit/template-command-parity.test.ts`;
3. qa 纳入:tests/unit 自动被 `bun test` 收编,r13 合约的 qa 组成不变。
