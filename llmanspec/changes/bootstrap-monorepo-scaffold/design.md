# Design

## 目标结构

```
llman-sdd/
├── package.json          # npm workspaces + engines.bun + lint/format/typecheck/test 聚合脚本
├── .bun-version / bun.lock
├── tsconfig.json         # ESNext + bundler 解析 + types:["bun"] + paths(根聚合)
├── .oxlintrc.json / .oxfmtrc.json
├── .pre-commit-config.yaml   # prek:local(bun oxlint / bun oxfmt --write)+ pre-commit-hooks v5
├── justfile              # install/check/qa/test/lint/format/lint:fix/build/clean
├── packages/core/        # 纯域逻辑(本 change 仅占位:导出版本与公共类型)
├── apps/cli/             # commander 入口 + scripts/build-binary.ts
└── tests/
    ├── bdd/              # Gherkin→bun:test runner(features/steps/runner.ts)
    └── golden/           # v1 渲染基线 + 对照脚本
```

## 边界与适配器(全局架构决策,后续 change 遵守)

- **core 纯域**:文件系统 / git / 终端副作用一律经接口(ports)注入,域逻辑可在内存 fixture 上跑 golden 对照
- **TemplateEngine 适配器**:nunjucks 实现(`autoescape: false`;trim / 尾换行语义对齐 minijinja;自定义 `unit()` 走 `env.addGlobal`);模板 .md 双树(en/zh-Hans)原样搬运
- **PromptDriver 接口**:v1 用 @inquirer/prompts 实现;ink TUI 为后续独立 change,两者禁止同进程混用
- **git 子进程**:`Bun.$`/`Bun.spawnSync` 裸调 git,移植 `git_utils.rs` 的 local-first 默认分支解析;不引入 isomorphic-git
- **7z 适配器**:7z-wasm(可选系统 7z 快路径),freeze/thaw 与 v1 双向兼容

## 依赖映射(v1 Rust → v2 TS)

clap→commander;minijinja→nunjucks;inquire→@inquirer/prompts;gherkin-zh→@cucumber/gherkin(官方 i18n 已含 zh-CN「规则」);schemars+jsonschema→zod+zod-to-json-schema;serde-saphyr→yaml(eemeli);ureq→fetch;llm_json→jsonrepair;sevenz-rust2→7z-wasm;crossterm 表格→cli-table3+picocolors;rust-i18n→删除(国际化靠模板双树)。

## 范围裁决

保留 freeze/thaw(核心);`project migrate` 留壳(指向 v1);移除 import / worktree / checkpoint / delta / rust-i18n。

## 测试策略

- 单元:bun:test
- BDD:`tests/bdd` runner,`@executable` 场景由 `bun test tests/bdd` 执行(与 config `bdd.run_command` 一致)
- golden diff:同一 fixture 上 v1 与 v2 输出生成物对照
- git 生命周期:临时仓库集成测试(后续 port-change-lifecycle 落地)
