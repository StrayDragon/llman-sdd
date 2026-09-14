# Design

## 模板引擎(packages/core/src/templates/)

- nunjucks Environment:`autoescape: false`;未定义变量渲染为空(Lenient 对齐);全部变量为字符串
- 变量集(buildTemplateVars):`llman_version`;bdd 段存在时 `bdd_enabled="true"`、`bdd_framework`(缺省空串)、`bdd_feature_dir`、`bdd_run_command`(effective:显式 run_command → framework 派生(pytest-bdd/rstest-bdd/cucumber-js/behave)→ echo 占位)、`bdd_default_language`、`bdd_verify_prompt`;`extra_skill_<stem>`("llman-sdd-arch-review" → `extra_skill_arch_review`)仅启用时注入
- `unit(id)`:全局函数,渲染 units/<id>.md 内容(同 env 同变量),递归上限 32,缺 id 报错
- 渲染产物 `trim_end()`(尾随空白全去,落盘时补单一 `\n`)
- locale:`normalizeLocale`(zh/zh-cn/zh-hans* → zh-Hans;en* → en;其余透传)+ `localeFallbacks`([normalized, 语言主部, en] 去重);资源加载按链取首个命中(unit 级独立回退)

## 资产

`packages/core/templates/sdd/` 整树搬运自 v1(en / zh-Hans / shared);npm 分发随包携带,单二进制嵌入留 release 阶段。

## init / --update(packages/core/src/init/)

- 脚手架:`llmanspec/config.yaml`(DEFAULT_CONFIG_EN / ZH_HANS + `$schema` 头行)、`specs/.gitkeep`、`changes/archive/.gitkeep`
- AGENTS.md 托管块(marker `<!-- LLMANSPEC:START/END -->`):已有块 → 替换块体;无块 → 前插;llmanspec/AGENTS.md 已存在内容保留
- skills:默认 10(bootstrap 后清单)+ extra_skills 扩展;渲染 → `.agents/skills/<stem>/SKILL.md`(`trim_end + '\n'`,防反复 update 抖动)
- ethics 门:每个渲染产物必须含 5 个 ethics 治理键,缺失报错
- 清理:仅管 `llman-sdd-` 前缀命名空间,候选集外整目录删除;无前缀自定义 skills 不动

## golden 验收

`tests/golden/check.ts` 扩展 v2 通道:v2 渲染本仓库等价 config → 与 baseline diff;版本号归一化(`0.0.77`/`0.1.0` → `<VER>`)后 diff 为空。

## 测试策略

单元(engine Lenient/unit 递归/locale 链/ethics 门/cleanup)+ BDD(`@executable`:临时目录跑 init,断言产物面)+ golden diff。
