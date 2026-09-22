# Design: 渲染层地基

## 决策 1:human 不进渲染器

human 是每命令的散文形态(lines 数组/全文渲染),强行 IR 化会为对齐而对齐。渲染器只统一**机器格式**:json/compact-json/toon 从同一 IR 产出;human 保持现有 render* 函数原样。C3 翻缺省时只是把「缺省走哪个渲染分支」换掉。

## 决策 2:IR = 现有 `--json` 的精确载荷

不重新设计数据形状——IR 就是他今天 `--json` 已经在输出的对象(renderValidateJson 的 items 结构、list 的 changes 数组等)。这保证 json pretty 字节级不变,且 C2 的 INFO 过滤、C3 的 toon 化都作用在同一份 IR 上。

## 决策 3:compact-json 归一为真紧凑

现状三种写法:list/show 的 `text.replaceAll('\n','')`(pretty 去换行,冒号后仍带空格)、show 的 `indent: 0`。统一为 `JSON.stringify(ir)`:数据零差异、单行、真紧凑。`--json --compact-json` 非缺省面,空白不属合约(`单行紧凑 JSON` 两态皆满足),基线比对时对该差异白名单化。

## 决策 4:toon 用官方 encoder,零配置

`@toon-format/toon` v4.1.1(0 运行时依赖,~110KB,MIT,纯函数)进 packages/core。delimiter 用缺省 comma(tab 更省但牺牲可读性与工具链兼容,不做 flag)。编码器对非 ASCII 键/含逗号引号值的加引号行为以 round-trip 单测钉死(中文 capability 名 fixture)。

## 权衡

- 备选「自研 toon 编码器」被否:spec 一致性(官方 conformance suite)成本远超省一个依赖。
- 备选「C1 直接把 toon 挂 --output flag」被否:flag 面属合约,留给 C3 一次改清;C1 保持 flag 零变化,验收只用基线 diff 说话。
