# tasks

测试边界（seam）：既有 harness 复用——纯函数注入 IO、`runCli` 子进程 + `makeTempRepo`；新增多根 fixture = makeTempRepo 预置子包 `llmanspec/`（不发明新边界）。

实施期specs转写纪律：propose 落地的是裸规则；每个任务实施时把其覆盖的裸规则转写为可执行 `场景:`（嵌套 GWT）并补 step 绑定，转写完成后才可勾选该任务。

## t1 根发现算子（core + unit）

- [x] 新模块 `packages/core/src/validation/roots.ts`：从 git toplevel（或给定起点）约定扫描有效根（`config.yaml` 或 `specs/` 判定），深度复用 `--max-scan-depth`，排除 `node_modules`/`target`/`.git`；纯函数 IO 注入；单测：零子包 = 单根、多根排序稳定、排除目录生效、深度上限
- [x] `validate --specs` 在单根仓库的输出与现行为逐字节一致（向后兼容回归锁，单测断言无 roots 维度新增字段）

## t2 validate 双粒度（cli + validation + bdd）

- [blocked-by: t1]
- [x] `validate --specs` 接入发现算子：`--directory <path>` 固定发现起点（缺省 cwd 语义不变）；`--all-roots` 聚合扇出——每根跑结构校验 + 各根 config 的 `check_command` batch-once，结果按根分组（TOON/JSON 聚合模式外包 `roots[]`，单根形状零漂移），退出码任一根红即红
- [x] BDD：多根 fixture 场景——子根有独立 check_command（如 echo 桩）时逐根验证互不串扰、聚合模式收集各根结果、子根红导致聚合退出码非零；补齐 step 绑定并把对应裸规则转写为可执行场景
- [x] staleness 按根计算：各根 scope 相对**实例根**解析，`touchedPaths` 按根归属过滤（单测）

## t3 路径单一归属（validation）

- [blocked-by: t2]
- [x] 单一归属判定与 validate ERROR：根 specs `# scope:` 命中其他根实例目录时报错列出冲突路径与两侧根；xylitol 形态 fixture（根 specs scope 含 `packages/tui/` 且 `packages/tui/llmanspec/` 存在 → ERROR）
- [x] spec 助手注册表按根：`next-req-id` / `add-req` / `skeleton` / `resolve-req` 以 cwd（或 `--directory`）解析实例根，跨根不互通（单测：子根取号只扫子根注册表）；补 BDD 场景转写

## t4 init 与 agent 面（init-generators）

- [blocked-by: t1]
- [x] init 逐根行为锁定：子根 init 写 config 骨架 + 双托管块（AGENTS.md 既有内容保留）、缺省**不写** `.agents/skills`；`--skills` 旗标显式开启子根注入；仓库根实例行为与今天一致（含 skills）
- [x] `init --update` 全根扫块：复用 t1 发现算子刷新所有发现根的托管块（保留内容）；skills 与命名空间清理仅根实例；单测 + BDD 场景转写（多根 fixture：两根各改块体内容后 --update 均刷新且自定义内容保留）

## t5 xylitol 试点验收 + 全量门禁（端到端）

- [blocked-by: t2]
- [blocked-by: t3]
- [blocked-by: t4]
- [x] 以 xylitol 实际仓库形态做端到端验收 fixture：根 + `packages/xylitol-tui/llmanspec/`（16 capability 迁移样例子集）+ `--all-roots` 聚合输出按根分组、per-root check_command（cargo 桩）互不串扰、单一归属 ERROR 在根 specs 未迁出时触发
- [x] 全量门禁：`just qa`（check + test + 渲染门 + pending + schema）与 `llman-sdd validate <id> --strict` 全绿；模板/命令面改动触发的 `.agents/skills` 刷新在本分支 `init --update` 并提交
