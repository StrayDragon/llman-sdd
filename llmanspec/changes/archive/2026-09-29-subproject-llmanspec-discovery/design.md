# design：子项目 llmanspec 自动发现与验证

## 0. 公理与不变式

**统一根模型**：一切操作以「一个 llmanspec/ 目录」为操作单元；根仓库是缺省实例，子包携带的 llmanspec 是又一个实例，二者走完全相同的代码路径——零「子项目模式」分支。由此导出：

- **算子单一**：validate / staleness / spec 助手都是「对一根运行」的算子；聚合只是把算子对每个根扇出再按根标注结果，不存在第二套「子项目结果格式」。
- **可移植性**：子根 llmanspec 与根的形状字节同构（specs + config.yaml + 托管块），独立发仓时原样抬走。
- **唯一有意 divergent**：`.agents/skills` 注入策略（见 §4）——agent 面与验证面分离，是本设计唯一一处非对称，以 `--skills` 逃生门兜底。

## 1. 根发现（discovery operator）

- 输入：git toplevel 起点或 `--directory <path>` 覆盖；约定扫描 `**/llmanspec/`（目录含 `config.yaml` 或 `specs/` 视为有效根），深度上限复用 `--max-scan-depth`（缺省 8），排除 `node_modules`、`target`、`.git`、归档冻结产物。
- 输出：根列表（每项 = 实例根目录 + `llmanspec/` 路径），按路径排序稳定输出；git 根自身的 `llmanspec/` 恒为第 0 号根（存在时）。
- **向后兼容铁律**：发现结果仅一个根（= 当前行为）时，所有命令输出与今天逐字节一致（无根归属维度的差异）。
- 纯域实现：扫描经 IO 注入（对齐 `packages/core` 纯度规约），落在 `packages/core/src/validation/discover.ts` 旁（新模块 `roots.ts`），validate / init --update 复用同一算子。

## 2. validate 双粒度

- **逐根（缺省）**：cwd 字面量语义升格为明文契约（现状已成立）；`--directory <path>` 固定发现起点，免 cd、脚本友好。不做 `--roots` 多选（用户定案）。
- **聚合（`--all-roots`）**：对发现根逐个跑同一套 validate（结构校验 + 各根 config 的 `check_command` batch-once），结果按根分组、每项带根归属；**退出码 = 任一根红即红**。缺省不聚合（自动的是发现，显式的是聚合——BDD 成本为各根之和，退出码可预测性要求缺省保守）。
- **输出 schema**：TOON/JSON 在聚合模式外包一层 `roots[]`（每根一个现形状的 items 集）；human 按根分段。`--output json` 的单根形状不变。schema 演进仅发生在显式聚合模式，单根零漂移。
- **per-root runner**：各根 `specs.check_command` 在其自身 config.yaml，batch-once 语义不变；`LLMAN_SDD_HARNESS_ACTIVE` 嵌套守卫在子进程链的传递按既有 harness 规约处理（makeTempRepo 剥离先例）。

## 3. 路径单一归属（staleness 可加性的地基）

- 规则：一个文件路径只归属一个 llmanspec 根。判定 = 根的 specs `# scope:`（相对**实例根**解析）与其他根的实例目录求交。
- 违规为 validate ERROR：根 specs scope 进「已有自己 llmanspec 的子包目录」时报错并列出冲突路径与两侧根。
- scope 相对基准从「git 根」改为「实例根」——xylitol 实测背书：8 个 `package-tui-*` spec 的 `tests/` scope 在实例根语义下零改写命中子包自带 tests（`# verified-by:` 证实其本意），同时满足独立发仓可移植。
- 迁移护栏：单一归属在实施期即对 xylitol 试点生效——根 specs 须先迁出 tui/bridge 子包覆盖（16+2 个 capability），根侧跨界部分（`src/infra/provider/`、`src/agent/compaction/`）拆出独立根 capability，拆分细则在实施 t5 以 xylitol 实际迁移 PR 形态验收。

## 4. init 与 agent 面（本变更新决策）

现状（已核实代码）：`runInit` 路径全根相对、`init [path]` 定根、无嵌套守卫；托管块双写 `AGENTS.md` + `llmanspec/AGENTS.md`（marker 保留既有内容）；无条件写 `.agents/skills`（10 skills，按目标根 config 渲染）。

决策：

1. **init 维持逐根构造，零多根逻辑**：`init packages/xylitol-tui` 即初始化该子根（config 缺省骨架 → 结构校验模式起步，check_command 按需自配）。嵌套误初始化不在 init 拦——单一归属 validate ERROR 是唯一把关点（一个规则一个出口）。
2. **托管块照旧**：子根 init 照写双托管块（xylitol-tui 已有 AGENTS.md → prepend 保留）。托管块是子根的 agent 导航面，内容与根实例同构（公理：零特殊分支）。
3. **skills 单面注入**：`.agents/skills` 仅当目标是仓库根实例（git toplevel，或无 llmanspec 祖先）时注入；子根 init 缺省**不注入**、不清理；`--skills` 显式开启子根注入（逃生门，供嵌套 skills 发现可靠的 harness）。理由：skills 是 agent 面非验证面；嵌套 `.agents` 的发现跨 agent CLI 不可靠；N×10 份重复是维护噪音；子根 config 的 runner 差异由其 AGENTS.md 托管块与文档承载。
4. **`init --update` 升级为全根扫块**：复用 §1 发现算子，刷新**所有发现根**的托管块（各根保留其内容，仅 marker 块体更新）；skills 仍只刷仓库根实例；--update 的 skills 命名空间清理（llman-sdd-* 候选集外移除）同样仅根实例。

## 5. req id 注册表按根

`next-req-id` / `add-req` / `resolve-req` / skeleton 的注册表扫描根 = cwd（或 `--directory`）解析的实例根——cwd 字面量语义的又一自然推论，max+1 语义（align-next-req-id-max-plus-one）不变。跨根 id 不保证唯一、`resolve-req` 不跨根（聚合模式跨根反查列为可选后续，本期不做——xylitol 迁移期历史引用在子根下解析，验收场景覆盖）。

## 6. 测试 seam 与 specs 落地形态

- seam：既有两条 harness（纯函数注入 IO / `runCli` 子进程 + makeTempRepo），新增多根临时仓库 fixture（makeTempRepo + 子包目录预置 llmanspec/），不发明新边界。
- **propose 阶段落地裸规则**（无嵌套场景）：多根场景的 step 绑定随 apply 的实现同步落地（runner 对未匹配步骤抛错，先落场景必红——与 align-next-req-id-max-plus-one 相同的顺序约束）；apply 每个任务勾选前把对应裸规则转写为可执行 `场景:` 并补绑定。
- golden / qa 机器不受影响：渲染门只渲染本仓 config；新增 init 策略测试入 tests/unit 与 tests/bdd。
