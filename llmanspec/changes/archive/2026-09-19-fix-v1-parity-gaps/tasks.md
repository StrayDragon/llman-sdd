# Tasks

测试接缝(seam):复用既有 seam——核心解析器纯函数单测(临时 changes 目录 fixture)、CLI 子命令集成断言(复用 MVP/单测的临时仓模式)、BDD steps(真实工作区/临时仓库),不发明新 seam。

- [x] T1: Specs landing——绑定分支编辑 live specs:peripheral-commands 新增 r61 条款(show/validate 的 change id 前缀解析合同)并在 r21 字段集补 matchedViaPrefix;review-freeze r23 warningCount 措辞改三类信号之和;peripheral-commands 增 @executable BDD 场景;commit [blocked-by: 无]
- [x] T2: 核心解析器——新增 resolveChangeId(io, root, input)(exact > unique prefix > multiple 报错列候选 > not found,大小写敏感);单测覆盖五类分支(含 exact 优先于前缀、spec id 不被劫持语义注释) [blocked-by: T1]
- [x] T3: CLI 接线——show change 分支/--type change 分支与 validate change 单项分支接入 resolveChangeId;人读输出发 stderr prefix match 提示;JSON matchedViaPrefix 如实上报;BDD steps 补齐 r61 场景;report.test/show 相关单测调整 [blocked-by: T2]
- [x] T4: 技术债——renderSpecJson morphology 字面量改复用 collectSpecs().morphology(无输出变化,单测保绿) [blocked-by: T3]
- [x] T5: 门禁全绿——`just qa`、`llman-sdd validate --all --strict --no-interactive`、`just golden`;端到端复验 show c2805 式前缀场景(临时仓) [blocked-by: T4]
