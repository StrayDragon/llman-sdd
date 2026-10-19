---
depends_on: []
title: freeze 打包依据 gitignore 忽略链过滤归档内容
---

## Why

`archive freeze` 目前把候选归档目录整目录无过滤打进 7z 冷备:change 目录里遗留的构建产物(`target/`、`node_modules/` 等,通常已被 git 忽略)一并入包。实测(见 <https://github.com/StrayDragon/llman-sdd/issues/9>,xylitol 仓库)单次 freeze 产出 68 MB 冷备,而解包正文仅 5.8 MB、理想压缩体积约 1.4 MB——98% 体积是 cargo `target/` 里的 `.so` 与可执行文件。连带效应:freeze 每次全量重压,内容寻址 blob 互不共享,LFS 对象存储峰值 209 MB。

根因:`runFreeze` 把 change 目录名直接作为 entries 传给 `7z a`,没有排除通道。

## What Changes

- freeze 打包前对每个候选目录做 **TS 侧内容过滤**,只把未被忽略的文件清单传给既有 `SevenZipPort.add`(端口签名不变,entries 从目录名变为文件名列表)。
- 忽略规则 = git 式层叠 `.gitignore` 求值:
  - 候选目录树内各层 `.gitignore` 由里向外求值,最深匹配层优先决定忽略/包含;
  - 链上溯至**项目根**(自实例根向上探测 `.git` 定位);无 `.git` 时以**实例根(llmanspec 所在目录)**为最外层;
  - 判定遵循 gitignore 语义(目录尾斜杠、`!` 取反、`/` 锚定、`**`),采用 `ignore` npm 包(纯函数,零副作用,符合 core 纯域纪律),新增为 core 运行时依赖。
- 新增 `archive freeze --ignore-file <path>`(可重复):用户指定若干 gitignore 格式文件,具有**最高优先级**(压过一切 `.gitignore` 层);文件不存在即报错,不做静默降级。
- walk 恒剪枝 `.git` 目录(嵌套 vendored 仓库的元数据不入包,与 git 行为一致)。
- 防护:某候选过滤后剩零文件时,freeze 在任何写变更(写卡/删目录)之前报错中止。
- 可观测性:freeze 人读输出追加排除计数摘要行(不改退出码语义)。
- 无任何忽略源(无 `.gitignore`、无 `--ignore-file`)时行为与既有一致:全量打包,既有场景与产物形态不变。

## Capabilities

- `review-freeze`(r24 扩展邻域):新增 r120「freeze 内容过滤(gitignore 层叠)」条款及可执行场景;r24/r25 既有条款不动,thaw 合同不变(过滤只影响入包内容集合)。

## Impact

- 代码:`packages/core/src/archive/freeze.ts`(接入过滤)、新增 `packages/core/src/archive/` 下忽略链模块;`apps/cli/src/commands/archive.ts`(注册 `--ignore-file` 并贯通 FreezeOpts);`packages/core` 新增依赖 `ignore`(同步更新根 lockfile 与 `llmanspec/AGENTS.md` 依赖映射)。
- 测试:过滤模块纯函数单测(锚定/取反/层叠优先级/无根回退/用户文件最高优先/零文件防护);`tests/unit/archive.test.ts` 增真 7z 过滤往返;`tests/bdd/steps/meta-foundation.ts` 模式增 r120 场景步骤(真实 CLI 子进程 + 临时仓库);`tests/integration/binary.test.ts` 既有往返应保持绿。
- 兼容性:旧冷备(无过滤时代产物)不变、`--list`/thaw 不受影响;对已有 `.gitignore` 的仓库,新 freeze 产物条目集合收窄(这正是修复目标)。无破坏性 CLI 面变更(只增选项)。
