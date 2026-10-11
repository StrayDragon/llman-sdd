# tasks

- [x] T1: 纯函数与单测——eval 侧新增 auth 注入 lib（`resolveAuthJsonPath(home?)`/`copyAuthIfExists(src,dest)`，缺失容错+stderr 提示）+ `tests/unit/eval-auth.test.ts`（路径/缺失/拷贝三例）+ wrapper 条件 cp 行 grep 断言
- [x] T2: 接线——`eval/run.ts writePiRuntime` 调 copyAuthIfExists（agent=pi 分支内）；`eval/tasks/playbook/environment/pi-wrapper.sh` 增存在才 cp auth.json；`eval/groups.yaml.example` SSOT renderer 注记补 auth 自动注入一句（再生不丢）
- [x] T3: specs 落地——绑定分支 `eval-playbook.feature` r86 描述尾追加 auth 注入句 + 新嵌套 `场景:`（缺失容错+gitignore 三层断言，挂 `bun test tests/unit/eval-auth.test.ts` 与 grep 双命令或单命令聚合）；`llman-sdd validate --specs` 过
- [x] T4: 全门禁——`bun test tests/`、`just check`、`bun tests/bdd/assert/quality-gates.ts`、`bun run check:stc`、`bun tests/golden/check.ts` 全绿；`llman-sdd validate <id> --strict` 绿
