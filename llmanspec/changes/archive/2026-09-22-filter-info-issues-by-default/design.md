# Design: INFO 级 issue 缺省过滤

## 决策 1:过滤点在 items 构建后、渲染前(单一收口)

validate 的三个目标路径(单项 spec、单项 change、--all)统一在 items 集齐后套同一个过滤映射,文本与 JSON 天然同口径;不进 core 校验引擎(判定层无感知,过滤纯属展示层)。`valid` 字段与退出码在过滤前已定,天然不受影响。

## 决策 2:过滤语义 = 仅 INFO 被剔除

WARNING/ERROR 一律保留(含 --strict 升级后的 ERROR)。`--include-info` 为唯一恢复入口,不做级别枚举 flag(避免 flag 面膨胀,C3 的 --output 统一另议)。

## 权衡

- 备选「在 core validateAllSpecs 加参数」被否:判定与展示分离,core 保持纯判定;过滤是 CLI 展示策略。
- BDD 验收用「pending 规则的 valid spec」fixture:它是唯一稳定产生 INFO 的构造(xylitol 实测来源),断言两态 issues 差集恰为 INFO 级。
