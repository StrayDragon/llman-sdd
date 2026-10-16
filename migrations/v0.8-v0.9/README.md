# v0.8 → v0.9 迁移

本窗口包含三项迁移,依次阅读适用部分。

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
# 迁移手册按版本聚合:范围内全部已登记版本逐版输出(左开右闭)
llman-sdd project migrate prompt --from-version 0.8.2 --to-version 0.9.0

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

## 迁移 3: init locale 优先级链与托管块刷新 per-workspace 化

init 渲染生效 locale 统一为 `config.yaml 显式 locale 键 > CLI 选项(--locale/--lang) > 内置默认 'en'`；
config 缺失时生成 config 并取 `CLI 选项 > 内置默认`。多 workspace 实例各自独立解析,互不继承。
`init --update` 的托管块刷新收敛为 per-workspace 语义:任意实例根上运行均自 git toplevel
扫描并刷新全部发现根的托管块(skills 注入与 llman-sdd-* 命名空间清理仍仅仓库根实例)。

### 破坏面

1. **update 时 `--locale` 生效**:config 无显式 `locale:` 键的仓库,`init --update --locale <x>` 从"静默忽略"变为"实际生效"——托管块按传入 locale 重渲染;有显式键时 config 压制 CLI 选项。
2. **缺键 WARNING**:既有 config.yaml 无显式 `locale:` 键时,每次 init / init --update 输出 WARNING 指明回退值与修复路径,补键前每次都会出现。
3. **子根 update 扫描范围扩大**:在子根实例上 `init --update` 现在会刷新同一 workspace 内全部发现根(含仓库根与兄弟子根)的托管块,此前只刷新自身;对其他实例托管块的手工改动会被模板渲染覆盖。
4. **新增告警与契约成文**(无行为变化):目标根无实例而祖先存在实例时 init 输出新建实例 WARNING;托管块 marker 更新契约(双标记有序原位替换/END 先于 START 报错/标记缺失前置插入)由既有行为显式成文。

### 升级步骤

```bash
# 1. 在 llmanspec/config.yaml 顶层补显式 locale 键(钉住渲染语言并消除每次 update 的 WARNING)
#    locale: zh-Hans
# 2. 在仓库根(或任意实例根)统一刷新托管块,确认语言与内容符合预期
llman-sdd init --update
llman-sdd validate --all --strict
```
