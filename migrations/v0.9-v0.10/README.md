# v0.9 → v0.10 迁移

本窗口为破坏性批次（change `simplify-cli-core-and-skills` 与
`subproject-namespace-scope`）：模板树单线化为中文、收口门禁收紧、命令面退出码收敛、
只读命令接入实例根发现、写入命令（`change`/`archive`）接入同一根发现，并补齐
`--backend` 归一化。以下六条破坏面逐条给出现状、升级步骤与自检方式，依次阅读适用部分。

## 破坏面速览

1. **模板 locale 单线化**：`locale: en` 的存量项目升级后渲染结果变为中文。
2. **收口门禁收紧**：`change finalize` 的守卫收紧，合约未改的 change 不再能收口。
3. **退出码收敛**：五个纯父分组空调用退出码由 0 改为 2；缺必需参数与非法枚举值的退出码
   由 1 改为 2。根裸调用仍退出 0，但帮助改走 stdout。
4. **只读命令接入根发现**：只读命令在子目录运行时的结果改变。`list` 与 `graph` 此前
   静默返回空，`config` 此前泄漏 `ENOENT`；此后解析到最近实例根。
5. **`--backend` 归一化**：`--backend` 的空值、大小写与 `page-index` 别名由报错改为接受。
6. **写入命令接入根发现**：`change`/`archive` 在子目录调用时归位最近实例根，不再就地
   新建 `llmanspec/`；无有效实例可归位时由「就地新建」改为域错误退出 1。

---

## 迁移 1: 模板单线化,`locale: en` 项目渲染结果变为中文

0.10.0 删除内置英文模板树 `packages/core/templates/en/**`（29 个文件），内置语言包只剩
`zh-Hans`，语言无关的 `shared/` 保留。`normalizeLocale` 把空值、`zh` 前缀、`en` 前缀与
未知值一律归一为 `zh-Hans`，兜底链尾固定为内置默认 `zh-Hans`；`config/schema.ts` 的
`locale` 缺省值由 `en` 改为 `zh-Hans`。方言随之收敛：`spec skeleton` 取归一后的 locale，
恒产出 `# language: zh-CN` 骨架。

### 破坏面

- `locale: en` 的存量项目升级后渲染结果变为中文。

### 升级步骤

```bash
# 1. 在 llmanspec/config.yaml 显式钉住语言(可选;写 en 与不写等价,均渲染中文)
#    locale: zh-Hans
# 2. 刷新托管块与 skills,渲染语言收敛为中文
llman-sdd init --update
# 3. 全量校验,确认骨架与既有 specs 的方言一致(zh-CN)
llman-sdd validate --all --strict
```

### 自检

- `llman-sdd init --update` 后,`AGENTS.md` 托管块与 `.agents/skills/**` 均为中文。
- `llman-sdd spec skeleton <name>` 产出的 `# language:` 为 `zh-CN`,不再有 en 骨架。
- 仓库内不再出现英文渲染产物;`llmanspec/config.yaml` 无对 `en` 语言包的依赖。
- 另注:模板资源缺失由静默跳过改为**显式报错**——此前缺失资源时 `init` 仍退出 0 并静默
  留下陈旧托管块,此后缺失即失败,便于定位。

## 迁移 2: 收口门禁收紧,合约未改的 change 不能收口

`change finalize`（`change archive` 同理）在合并前新增收口门,复用 `specs-landed` 与
`tasks-done` 判据:要求 `specsLanded || !needsSpecsChange`,且 `tasks.md` 存在时要求全部
勾选。门失败零写入。此前 `stage: draft`、仅 `proposal.md`、specs 从未改动的 change 也能
收口并退出 0,该缺口随本版本关闭。

### 破坏面

- `change finalize` 的守卫收紧，合约未改的 change 不再能收口。

### 升级步骤

```bash
# 1. 需要改合约的 change:在绑定分支上落地并提交 llmanspec/specs/** 的改动,再收口
# 2. 确实不改合约的 change:在 proposal.md frontmatter 显式声明 needs_specs_change: false
# 3. tasks.md 存在时,收口前勾选全部任务
llman-sdd show <change-id>          # 查看 specs-landed / tasks-done 判据
llman-sdd change finalize <change-id>
```

### 自检

- 对 specs 未落地的 change 执行 `change finalize` 被拒,且**不产生任何写入**。
- 声明 `needs_specs_change: false` 的 change 可直接收口;`specsLanded` 为真的 change 同样
  通过。
- `llman-sdd show <change-id>` 在 `tasks.md` 缺失时不再提示补勾任务。

## 迁移 3: 命令面退出码收敛为 2

参数解析失败统一归到退出码 2:缺必需参数、多余参数、非法枚举值（`change --method`、
`graph --depth`、`list --sort`、`validate --type`、`validate --stage`、`project migrate`
未知 action）。五个纯父分组 `change`、`spec`、`project`、`archive`、`index` 缺必需子命令
时改为报用法错误退出 2;`config` 保留默认 action 不变。根裸调用仍退出 0,但帮助改走
stdout。

### 破坏面

- 五个纯父分组空调用退出码由 0 改为 2；缺必需参数与非法枚举值的退出码由 1 改为 2。根裸
  调用仍退出 0，但帮助改走 stdout。

### 升级步骤

```bash
# 1. 更新以退出码 1 判定「缺参数 / 非法枚举」的脚本,改按退出码 2 判定
# 2. 以退出码 0 判定「分组空调用」的脚本,改按退出码 2 判定
llman-sdd <group>                   # 现为用法错误,退出 2
llman-sdd                           # 根裸调用:帮助走 stdout,退出 0
```

### 自检

- `llman-sdd` 退出 0,帮助输出在 stdout。
- `llman-sdd change` 退出 2;`llman-sdd list --sort bogus` 退出 2（此前退出 1）;
  `llman-sdd graph --depth xyz` 退出 2。
- 域错误（如 `change not found`）仍退出 1。

## 迁移 4: 只读命令接入实例根发现

只读命令 `list`、`show`、`graph`、`review`、`config`、`index`、`context` 接入与 `validate`
同一套根发现算子:起点为 `--directory <path>`（缺省当前工作目录），向上找最近的
`config.yaml` 或 `specs/` 所在实例。`--directory` 对全部命令可用。未找到实例根时报域错误
`no llmanspec root at or above <path>`,不再泄漏 `ENOENT`。仅发现单根时,输出与单根时代
逐字节一致。

### 破坏面

- 只读命令在子目录运行时的结果改变。`list` 与 `graph` 此前静默返回空，`config` 此前泄漏
  `ENOENT`；此后解析到最近实例根。
- `validate --specs` 与 `show` 的 `--directory` 由此前「已声明但未生效」改为真正生效：
  `validate --specs --directory <path>` 过去仍校验启动目录所在的注册表（子包内调用甚至会
  把另一实例根的条目算进来），`show --directory <path>` 过去只在机器形态生效——文本形态仍按
  启动目录判 gate，出现同一 change 两个输出面结论不一致。升级后二者一律判定被限定实例根，
  且相对路径写法（含相对祖先目录）与绝对路径等价。
- `show <id>` 未显式传 `--directory` 时保持前代行为（cli r109 单根逐字节一致条款推出的
  changes 豁免面）：即使工作区无有效实例但含 `llmanspec/changes/<id>`，仍按缺省实例目录
  读出该 change；仅显式 `--directory` 时才报 `no llmanspec root at or above <path>` 域错误。

### 升级步骤

```bash
# 1. 单根仓库无需改动(输出逐字节不变);需要时用 --directory 显式固定起点
# 2. 复核在子目录调用只读命令的脚本:此前拿到空结果或 ENOENT 的路径,现返回最近实例根
llman-sdd list --directory <path>
llman-sdd config --directory <path>
```

### 自检

- 在 `packages/core`、`apps/cli` 等子目录运行 `list`、`config`,结果与仓库根一致。
- 祖先目录无实例时报 `no llmanspec root at or above <path>`,不出现 `ENOENT`。
- 单根仓库下全部只读命令输出逐字节不变,含 `spec * --directory <绝对路径>` 的绝对路径
  分叉。

## 迁移 5: `--backend` 归一化

`resolveBackend` 补齐 trim 与 lowercase,接受 `page-index` 别名,空值与空
`LLMAN_SDD_INDEX_BACKEND` 归 `pageindex`。`rag` 仍为弃用后端,报错文案保留本仓写法。
`--backend` 旗标面不变(`index rebuild --backend`、`context --backend`)。

### 破坏面

- `--backend` 的空值、大小写与 `page-index` 别名由报错改为接受。

### 升级步骤

```bash
# 无需迁移动作;此前报错退出的下列写法现均可接受
llman-sdd index rebuild --backend page-index
llman-sdd index rebuild --backend ''
LLMAN_SDD_INDEX_BACKEND='PAGEINDEX' llman-sdd context --task '<task>'
```

### 自检

- `--backend ''`、`--backend PAGEINDEX`、`--backend page-index` 与带空白的取值均成功。
- 旧 `rag/` 目录**不**满足 pageindex 新鲜度（回归断言保持不变）。

## 迁移 6: 写入命令接入实例根发现

`change`(new/start/attach/next-id/diff/finalize)与 `archive`(freeze/thaw)接入与只读命令
同一套根发现算子：起点为 `--directory <path>`（缺省当前工作目录），向上找最近的
`config.yaml` 或 `specs/` 所在实例，落盘与读写目标随之锚定该根。此前这些命令以 cwd
字面量为实例根：在子目录调用会就地新建 `llmanspec/changes/`（子目录下出现游离实例），
`archive freeze` 会把冷备写到子目录。向上无有效实例时报域错误
`no llmanspec root at or above <path>` 并以退出码 1 结束，不再就地新建 `llmanspec/`；
`--directory` 指向的起点无法解析时同样报该错误。用户显式传入的路径参数保持 cwd 字面量
语义（`archive thaw --dest`、`change diff --export-patch`、`spec migrate-native <paths>`），
`init` 仍以位置参数 `[path]` 定根。

### 破坏面

- 在子目录（非实例根）调用 `change`/`archive` 的写入落点改变：此前写在 cwd 字样目录
  下，此后归位最近实例根。
- 无有效实例的目录下 `change new`/`archive freeze` 等由「就地新建 `llmanspec/`」改为
  域错误退出 1。

### 升级步骤

```bash
# 1. 单根仓库无需改动(输出与落点逐字节不变);脚本若依赖 cwd 字面量落点,改用 --directory
# 2. 多根仓库(子包自带 llmanspec/)显式固定起点,避免归位到子包实例
llman-sdd change new --directory <instance-root>
llman-sdd archive freeze --directory <instance-root>
# 3. 无实例目录先建实例,或用 --directory 指向已有实例
llman-sdd init <path>
```

### 自检

- 在子包源码子目录运行 `change new <id>`，proposal 落在该子包的 `llmanspec/changes/`，
  仓库根实例与当前目录都不出现新建 `llmanspec/`。
- 在无任何 `llmanspec` 的目录运行 `change new <id>`：stderr 含
  `no llmanspec root at or above`、退出码 1、该目录下无 `llmanspec/`。
- 单根仓库下 `change new --dry-run` 在仓库根与任意子目录输出逐字节一致；真实落盘仍归位
  仓库根实例。
- `llman-sdd validate --all --strict` 全绿（含 `--all-roots` 的跨根同号观测段：同号只报
  INFO/WARNING、不阻断、不影响退出码）。
