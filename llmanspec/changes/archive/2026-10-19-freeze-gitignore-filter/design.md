# 设计:freeze 内容过滤(gitignore 层叠)

## 机制选型(已与用户确认)

**采用 TS 侧过滤 + `ignore` npm 包**,walk 候选目录产出文件级清单,传入既有
`SevenZipPort.add(archivePath, baseDir, entries)`——端口签名不变,entries 语义从
「目录名列表」收窄为「文件名列表」(对 7z `a` 而言都是相对 baseDir 的路径参数)。

否决的备选:

- **翻译成 7z `-xr!` 开关**(issue #9 原建议):改动面最小,但取反模式 `!pat` 无法表达、
  `/` 锚定语义失真、`**` 支持不全——会静默漏排/误排,且把合约正确性押在 7z 通配符
  实现细节上。作为 design 备选记录,不采用。
- **手写最小 gitignore 匹配器**:省一个依赖,但取反、锚定、尾斜杠、`**` 边界极易写错;
  `ignore` 包为纯函数、零依赖、久经考验,符合 core 纯域纪律(同类先例:zod/yaml 直用)。

## 层叠求值语义(git 式)

对候选目录 `llmanspec/changes/archive/<dated-id>/` 做 DFS walk:

1. **忽略层栈**:进入每层目录时,若该目录含 `.gitignore` 则压入一个 `ignore` 实例
  (用 `ignore().add(lines)`);离开时弹出。**最深(最里)层优先**:对每个路径自栈顶向
  栈底求值,第一个给出判定的层胜出(即 git 的 per-directory 优先级;层内 `!` 取反、
  顺序语义由 `ignore` 包保证)。
2. **外层链**:栈底预置「候选目录 → 实例根 → (若存在)项目根」沿途各目录的
  `.gitignore`(越外优先级越低)。**项目根定位**:自实例根(`rootAbs`)逐级向上探测
  `.git`(目录或 worktree 的 `.git` 文件,经 `FsPort.exists`,不起 git 子进程);
  无 `.git` 时以实例根为最外层——用户定案的回退语义。
3. **用户补充文件最高优先**:`--ignore-file <path>`(可重复)指定的 gitignore 格式
   文件作为**比最里层更高**的优先级预置在栈顶。理由:用户在调用点显式给出,意图应
   压过树内任何 `.gitignore`(含其 `!` 回含);对标 git 的 `core.excludesFile` 取最低
   优先,但那是全局隐含配置,与本处「显式命令行参数」的意图强度不同。文件不存在
   → 报错中止(不静默降级,防止用户以为过滤了而实际全量入包)。
4. **目录剪枝**:路径判定为忽略的目录整棵剪掉(git 语义:被排除目录的子路径不回含);
   `.git` 目录恒剪枝(不经规则,内置)。
5. **路径形态**:求值一律用 POSIX 相对路径(相对各自 `.gitignore` 所在目录,锚定语义
   的基准即该目录——与 git 一致);目录判定加尾 `/`。

## 集成点

- `runFreeze` 在写卡**之前**完成过滤与防护检查:某候选过滤后零文件 → 报错,此时磁盘
  零变更(复用现有「7z 失败回滚卡」之外的更早失败位,天然原子)。
- 连带修复 `sevenzip.ts parseListNames`:旧实现按空白切分列,solid 压缩块内首个文件
  之后 Compressed 列为空,列数塌缩导致这些行被整行丢弃(潜伏缺陷,目录递归打包时代
  既有断言只查首条而未暴露);改为按表头列位切片,文件级清单的归档条目才可完整列出。
- `FreezeOpts` 增 `ignoreFiles: string[]`;CLI seam 将用户路径按 r116 先例保持
  cwd 字面语义、解析为绝对路径后传入(实现时确认 nodeIo 对绝对路径的透传,必要时
  在 nodeIo 补绝对路径支持——不引入第二个读文件端口)。
- 观测:`Froze N archived changes ...` 行外,追加一行排除摘要(如
  `Excluded 1130 files via 3 ignore layer(s)`);只在排除数 >0 时输出,不改退出码。
- dry-run/--list/thaw 路径不参与过滤(dry-run 保持纯候选枚举,不在本 change 扩展)。

## 规模与性能

- walk 是纯路径操作(不读文件内容),数千文件量级(实测 3105 文件)远小于 7z 压缩
  本身耗时;每层 `.gitignore` 只读一次、`ignore` 实例单次编译。
- entries 经 Emscripten `callMain` 的 JS 数组传入,**无 OS argv 长度限制**;万级以上
  条目若触及 wasm 堆压力,后备方案为 7z `@listfile`(写入临时列表文件)——记为
  后备,不在本 change 实现。

## 非目标(明确不做)

- `.git/info/exclude`、全局 `core.excludesFile`、`llmanspec/.thaw-tmp` 特判:不读。
- 关闭过滤的旗标(如 `--no-ignore-filter`):未请求;无忽略源时天然等价全量。
- dry-run 展示将排除条目、嵌套 `.gitignore` 的交互式调试:后续需求另立 change。

## 测试边界(seam,已确认沿用既有)

- **BDD**(r120 场景,真实 CLI 子进程 + 临时仓库,`tests/bdd/steps/meta-foundation.ts`
  模式):根 `.gitignore` 过滤、嵌套 `.gitignore` 层叠、`--ignore-file` 最高优先、
  无 git 根回退实例根、过滤后 freeze→thaw 自洽。
- **unit**:过滤模块纯函数矩阵(锚定/取反/尾斜杠/`**`/层叠优先级/`.git` 剪枝/
  零文件防护/用户文件不存在报错);`tests/unit/archive.test.ts` 真 7z 过滤往返。
