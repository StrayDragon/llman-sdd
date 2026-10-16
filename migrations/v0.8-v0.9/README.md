# v0.8 → v0.9 迁移

本窗口包含两项迁移,依次阅读适用部分。

## 迁移 1: 移除 `# capability:` 头,spec id 由路径全局分配

0.9.0 起 spec 头契约仅为 `# language:` + `# purpose:`；capability / spec id 在单个
`llmanspec/specs/` 实例内由 discover 扫描全部 `.feature` 后按 r101 算法分配（扁平与
目录式可混搭，撞名时升格为相对路径 id）。`功能:` 标题必须等于分配后的 id。

### 破坏面

1. **spec 头格式**：`# capability:` 不再结构化解析；`strip-legacy-headers` 会剥除该行。
2. **spec id 口径**：CLI `show`/`validate`/`spec add-req` 的 capability 参数以分配后的 id 为准，不再读头注释。
3. **校验**：缺 purpose、功能标题与 spec id 不一致、分配后重复 spec id → ERROR。

### 升级步骤

```bash
llman-sdd project migrate prompt --version-expr '0.8.1->0.9.0'

llman-sdd project migrate strip-legacy-headers --dry-run
llman-sdd project migrate strip-legacy-headers

llman-sdd init --update
llman-sdd validate --all --strict
```

## 迁移 2: `specs.check_transitions` 移除,状态流转校验 tag 定界化

状态流转表校验不再依赖任何配置开关:无 tag 时特征词嗅探(例子表头 `from`/`初始状态`、
`event`/`事件`、`to`/`目标状态` 三族至少两族命中)始终启用;场景级 tag 双向覆盖——
`@transitions` 强制纳管(残缺表报 E1),`@no-transitions` 全量豁免;双 tag 同挂判 ERROR。

### 破坏面

1. **配置键移除**:`specs.check_transitions` 在加载期宽松剥离(任意取值同径,非布尔值不再报类型错),并向 stderr 输出一次性 WARNING 指引改用 tag。
2. **嗅探缺省启用**:此前未开启该开关的仓库,命中特征词的场景大纲升级后将被校验——孤岛/死锁/非确定性等缺陷会新报 ERROR。
3. **E4 消息口径**:无终态的循环机中"无法回到初始状态"的陷阱改按实际违反项表述(`cannot return to the initial state`),旧版一律误报 `cannot reach any terminal state`。

### 升级步骤

```bash
# 1. 删除 config.yaml 的 specs.check_transitions(保留也会被剥离并提示)
# 2. 形似转移表但非状态机语义的误伤场景,在其 场景大纲: 头上加 @no-transitions
# 3. 列名不匹配特征词但确属转移表的场景,加 @transitions 强制纳管
llman-sdd spec transitions   # 查看特征词/判据/tag/门禁的权威说明
llman-sdd validate --all --strict
```
