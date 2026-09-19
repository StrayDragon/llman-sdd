# Tasks

测试接缝(seam):复用既有 seam——validateChange/finalizeChange 纯函数单测(fake GitLike/临时仓 fixture)、context-index 单测(indexStore)、BDD steps(真实工作区/临时仓库)、端到端临时仓脚本,不发明新 seam。

- [x] T1: Specs landing——validation.feature r12 scope 措辞修正 + 新增 r63/r64/r65;context-index.feature 新增 r62(+executable);peripheral-commands.feature r61 扩面改写;change-lifecycle.feature r15 补 finalize 分支门句;commit [blocked-by: 无]
- [x] T2: validateChange 完整性——注入可选 GitLike;stage 推断含 binding(四态)+COMPLETENESS 补 full;Full-not-ready WARNING(skill 引导);CLI 两侧调用点传 git;默认分支脏 specs 单次 WARNING(CLI 层 stderr);单测覆盖两 WARNING 的正反例 [blocked-by: T1]
- [x] T3: 孤儿验收 WARNING——validate.ts 验收循环 reqIds 为空报 WARNING(path `<cap>/acceptance/<name>`,v1 文案);单测 [blocked-by: T1]
- [x] T4: context 懒刷新——core 新增 loadTreeWithAutoRebuild(missing/corrupted/stale → 零 LLM rebuild 一次;失败返回 errorKind=index_rebuild_failed);main.ts context action 改薄壳;单测覆盖 fresh 直读/stale 重建/missing 重建/重建失败 [blocked-by: T1]
- [x] T5: 前缀解析扩面——resolveChangeId 接入 change start/attach/diff/finalize/archive(人读 stderr 提示,多义/未中报错退出);端到端临时仓验证五命令 [blocked-by: T1]
- [x] T6: finalize 分支门——finalizeChange 校验 currentBranch==binding.branch,不满足在任何写入前 LifecycleError;单测覆盖错误分支与正常路径 [blocked-by: T1]
- [x] T7: 门禁全绿——just qa、validate --all --no-interactive、validate <id> --strict、review 退出零、just golden;端到端复验(context 无索引自愈、finalize 错分支报错、change diff 前缀) [blocked-by: T2,T3,T4,T5,T6]
