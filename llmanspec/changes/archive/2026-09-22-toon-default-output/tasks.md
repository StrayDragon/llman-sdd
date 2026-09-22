# Tasks

测试接缝(seam):复用既有 seam——integration(spawn CLI)、BDD steps(临时仓库)、三仓库基线比对,不发明新 seam。

- [x] T1: Specs landing——六个 feature 条款重写(validation r47 增缺省与 --output 面、review-freeze r23 增缺省 toon、peripheral-commands r20/r21/r25 list/show 人读条款挂 --output human、config-command skills 条款、context-index 增 toon 缺省预留)+ AGENTS.md 定案改写与 toon 登记,commit [blocked-by: 无]
- [x] T2: validate + review 接线——--output 解析(优先级/别名守卫)、缺省 toon、stderr 错误通道保留;单测断言更新 [blocked-by: T1]
- [x] T3: list + config skills + index check 接线——同构 --output 面;index check IR {fresh,notes} [blocked-by: T2]
- [x] T4: show 接线——output tokens 增 toon/human,缺省 toon,人读全文挂 human [blocked-by: T2]
- [x] T5: 测试面更新——integration show-dirstyle 缺省断言改 human,BDD r47 补 --output human,新增缺省 toon 冒烟断言;`just qa` + `just golden` 全绿 [blocked-by: T3, T4]
- [x] T6: 迁移与收尾——migrations/v0.3-v0.4/README、CHANGELOG Unreleased(BREAKING);xylitol/crystalith 三命令实测;validate --strict + review 全绿;finalize [blocked-by: T5]
