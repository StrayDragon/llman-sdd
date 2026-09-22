# Tasks

测试接缝(seam):复用既有 seam——core 渲染器纯函数单测(新)+ 三仓库 CLI 字节基线比对(/tmp/c1baseline,P1 后抓取),不发明新 seam。

- [x] T1: core 渲染器——`packages/core/src/render/machine.ts`(json/compact-json/toon 三格式)+ `@toon-format/toon` 依赖 + AGENTS.md 技术栈登记;单测:三格式输出、toon round-trip(中文 capability、含逗号引号 detail)、compact 真紧凑断言 [blocked-by: 无]
- [x] T2: review 接入——CLI action 以 `{signals, summary}` 为 IR,json 分支走 renderMachine;`--json` 字节基线 diff 为空 [blocked-by: T1]
- [x] T3: validate 接入——renderValidateJson 改为「IR 构建 + renderMachine」;`--json` 字节不变,`--json --compact-json` 按归一化白名单比对 [blocked-by: T1]
- [x] T4: list 接入——core renderChangesJson/renderSpecsJson 改走 renderMachine;emit 的去换行逻辑移除,compact 由渲染器产出 [blocked-by: T1]
- [x] T5: show + config skills 接入——show asJson 分支以 renderSpecJson 对象为 IR;config skills json 同构处理;compact 归一化同上 [blocked-by: T1]
- [x] T6: 门禁 + 基线比对——`just qa`、`just golden`、`validate --all --strict`;三仓库重跑 cap.sh 与基线 diff:缺省输出与 `--json` 必须逐字节为空,compact 差异仅限空白归一化 [blocked-by: T2, T3, T4, T5]
