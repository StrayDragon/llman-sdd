# Design — unify-init-locale-precedence

## D1: locale 键显式存在性的探测方式

schema `locale: z.string().default('en')`（`packages/core/src/config/schema.ts:77`）在解析期就把缺键归一为 `'en'`，"键是否存在"的信息被抹掉。两个方案：

- **A（选定）**：schema 默认值保留；`loadConfigDetail` 从原始解析数据旁路报告 `localeExplicit: boolean`（additive 字段，既有消费方 `loadConfig` 不动）。init 用它实现优先级链。
- B：schema 改 `.optional()`，默认值下沉到各消费方——波及 config-command 展示、golden 等价 config、全量调用点，为一条告警不值得。

选 A：改动面最小，无迁移。

## D2: 生效 locale 解析（纯函数）

```
resolveEffectiveLocale(config, configLocaleExplicit, optsLocale):
  configLocaleExplicit ? config.locale        // 工作区配置优先
  : optsLocale !== undefined   ? optsLocale   // 其次 CLI 选项
  :                             config.locale // schema 默认 'en'（内置兜底）
```

- config 缺失（fresh init）：沿用现行 `opts.locale ?? 'en'` 生成 config，再按上链解析（此时 `localeExplicit = opts.locale !== undefined`，选项值已写入 config，渲染与配置天然一致）。
- 多 workspace：每个实例根独立走一遍（config 独立、选项是每次调用的全局量），互不继承。
- `localeFallbacks`（r18 兜底链）不变，作用在解析出的生效 locale 之后。

## D3: 告警通道与形态

- WARNING 走 **stderr**，退出码保持 0（告警非错误，`specs/cli` 的错误出口契约不受影响）。
- core 侧 `runInit` 经注入的 `onWarning?: (message: string) => void` 通道产出（保持纯域纪律：副作用注入）；CLI 侧接到 stderr。缺省回调为 no-op，既有单测不受噪声影响。
- 两条告警：
  1. 缺键：`config.yaml has no explicit 'locale' key; rendering fell back to <value> (set locale: in config.yaml or pass --locale)`
  2. 新建实例：`no llman-sdd instance at <root>; creating a new one (nearest existing instance: <ancestor>)`

## D4: 新建实例告警的判定

目标根无有效实例（`isValidRoot` false）时，用既有 r94 `resolveInstanceRoot`（`packages/core/src/validation/roots.ts:78`）向上找；命中祖先实例才告警。祖先也没有（真空白项目）不告警——无从推断意图。

## D5: 扫描门控移除

CLI `init.ts:56` 的 `(options.update ?? false) && repoRootInstance` 改为仅 `options.update`；skills 渲染/命名空间清理仍由 `runInit` 内部 `opts.skills` 逻辑天然限定在仓库根实例（r93 后半句不变）。
