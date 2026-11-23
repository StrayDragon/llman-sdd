# v0.6 → v0.7 迁移指引：req id 取号语义与子项目多根

0.7.0 包含两类变更：**`spec next-req-id` 取号语义变更**（默认行为变化，所有仓库可见）与
**子项目（workspace 子包）多根支持**（纯新增能力，不采用零影响）。

## 变更内容

### 行为变更：取号语义 smallest-free → max+1

- `spec next-req-id` 与共用实现的 `spec skeleton` 由「最小空闲号」（复用已删除 capability
  释放的号）改为「树内最大已用号 + 1」（空注册表输出 r1），与 `change next-id` 对齐。
- 谁受影响：**仅树内存在退役号段（曾删除 capability）的仓库**输出会变化——新取号跳过
  空缺向上分配；编号连续的仓库输出与 0.6.0 逐字节一致。
- 为什么改：最小空闲号会把刚退役的 id 重新发出，与归档 change 中的历史引用产生别名
  （`resolve-req` 无法区分新旧条款，历史提案的 rN 被静默偷换，issue #5 实测复现）。
  max+1 从根上断掉复用链；**不提供旧行为开关**（有意 divergent，取舍记录见归档 change
  `align-next-req-id-max-plus-one` 的 design）。
- `--json` 输出形状（`{reqId}`）与裸 rN 行不变；`resolve-req` / `add-req` /
  `add-scenario` 契约不变。

### 新能力：子项目多根（可选采用）

统一根模型——一切操作以「一个 `llmanspec/` 目录」为单位，子包携带自己的 `llmanspec/`
即又一实例，与根走完全相同代码路径。**单根仓库无需任何动作，所有命令输出逐字节一致**
（无 roots 维度、零漂移）。采用子根时的语义与义务：

- 自动发现：git 根起约定扫描（`config.yaml` 或 `specs/` 判定有效根），深度受
  `--max-scan-depth` 约束，排除 `node_modules`/`target`/`.git`。
- `validate --specs` 双粒度：逐根（「最近实例根」解析，`--directory <path>` 固定起点）与
  聚合（`--all-roots`，各根执行自己的 `specs.check_command`，按根分组，退出码任一根红
  即红；缺省不聚合）。
- **路径单一归属（硬约束）**：specs `# scope:` 以实例根（容纳 `llmanspec/` 的目录）为
  相对基准；某根 specs scope 伸入另一根实例目录时 validate 报 ERROR（祖先根豁免）。
  **给仓库引入子根前，必须先把根 specs 中覆盖该子包的 capability 迁出**。
- spec 助手注册表按根：`next-req-id` / `skeleton` / `add-req` / `add-scenario` /
  `resolve-req` 以实例根为扫描根，各根独立、跨根不保证唯一，`resolve-req` 不跨根
  （迁移后的历史 rN 引用到新子根下反查）。
- init 与 agent 面：子根 `init` 照写 `AGENTS.md` + `llmanspec/AGENTS.md` 双托管块，但
  **缺省不注入** `.agents/skills`（agent 技能面留在仓库根；`--skills` 显式开启）；
  `init --update` 复用发现算子刷新**全部发现根**的托管块，skills 渲染与 `llman-sdd-*`
  命名空间清理仍仅作用于仓库根实例。

## 升级路径

1. **无动作（大多数单根仓库）**：取号语义自动生效，其余一切不变。`llman-sdd init
   --update` 可选（刷新托管块版本戳）。
2. **机器消费方**：解析 `next-req-id --json` 的脚本形状不变；若罕见地依赖「复用空缺号」
   行为（不推荐——正是本次修复的别名缺陷），改为接受 max+1 输出即可。
3. **子包迁移（可选，采用多根时必做）**：`init packages/<pkg>` 建子根 → `git mv` 相关
   capability 目录到子根 `llmanspec/specs/` → scope 改写为实例根相对 → 跨界 capability
   拆分（子包部分随迁、根侧部分拆为新的根 capability）→ 根与子根各自
   `validate --specs` 确认无 `single-ownership` ERROR → 仓库根 `validate --specs
   --all-roots` 双端验收。xylitol 已完成同型试点勘测（16 个 `package-tui-*` capability
   整体迁移 + bridge 族跨界拆分），可作形态参照。
4. **多根仓库升级后**：在仓库根跑一次 `llman-sdd init --update`——所有发现根的托管块
   随之刷新；skills 与命名空间清理仍只发生在仓库根，属预期。
