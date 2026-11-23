# 构建注入前缀

三个值都由 `apps/cli/scripts/build-binary.ts` 在编译期替换进二进制。源码里必须写成完整的 `process.env.LLMAN_SDD_DEV_BUILD_*` 字面量，构建脚本的 define 键与这个字面量逐字相同。改成拼接出来的变量名，define 不会命中，二进制会退回开发路径。

`LLMAN_SDD_DEV_BUILD_` 比 `LLMAN_SDD_DEV_` 再多一层：同目录下以后还可以有开发期、但不进二进制的变量，不会和这三件编译产物混名。

`LLMAN_SDD_HARNESS_ACTIVE` 留在运行时。validate 每次拉起检查命令都会设置它，测试也会读取它。它不是 define。
