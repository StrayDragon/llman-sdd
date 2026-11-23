# 任务：构建注入前缀

测试边界（seam）：`apps/cli/scripts/build-binary.ts` 写出的 define 键，以及 `tests/integration/binary.test.ts`、`tests/unit/` 里对嵌入模板和 wasm 的断言。无规格改动。

- [x] T1: 将三处 `process.env.LLMAN_SDD_VERSION`、`LLMAN_SDD_EMBEDDED_TEMPLATES`、`LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64` 的字面量改为 `LLMAN_SDD_DEV_BUILD_` 前缀，构建脚本的 define 键与读取处一致
- [x] T2: 更新二进制与单元测试里的旧名字断言 [blocked-by: T1]
- [x] T3: `migrations/v0.10-v0.11/README.md` 追加一节，说明这三个键只存在于构建 define [blocked-by: T1]
