---
depends_on: []
title: review 聚合审查的 spec id 推导路径形态无关化(绝对路径调用全红修复)
needs_specs_change: true
branch: sdd/fix-review-sweep-path
base_branch: main
base_sha: cd7dd90275b7735af491a11a78d70af3ba4ca079
---

## Why

`llman-sdd review` 的 validate 信号在**任何仓库**都全红(CRITICAL 级),
本仓与未触碰的兄弟仓 crystalith 同现,main 分支干净 worktree 亦复现——
先在于主干,与本仓活跃 change 无关。

### 根因链(2026-10-18 verify 阶段取证)

1. `apps/cli/src/commands/review.ts:47` 以**绝对路径**装载 specs:
   `discoverSpecs(join(root, 'llmanspec', 'specs'), ctx.io)`;
2. 随后调 `validateAllSpecs(entries)` **未传 `opts.specsDir`**,缺省为相对
   `llmanspec/specs`;
3. `featureRelPath` 只做「specsDir/ 前缀剥除」,绝对文件名匹配不上相对前缀
   → rel 退化为全路径;
4. `preferredSpecIdFromRel` 对多段路径返回「全路径去 .feature」当 id →
   与 `功能: <capability>` 标题失配 → 13 项 verdict 全 ERROR
   ("Feature title must match assigned spec id")。

对照组:`validate --all` 经 `loadRootSpecEntries` 以根相对路径装载,前缀剥除
命中,故同树全绿——两命令对同一 specs 树判定分裂。

## What Changes

- `featureRelPath` 前缀剥除**后缀感知化**:specsDir 前缀不中时,按路径段
  定位 fileName 中 specsDir 的末次出现并取其后段——spec id 推导路径形态
  无关(绝对/相对、是否含 specsDir 前缀,同一文件同 id)。
- 契约条款:validation capability 增补「spec id 推导路径形态无关」;review
  所在 capability 增补「review sweep 与 `validate --all` 对同一 specs 树
  判定一致(同绿同红)」。
- review 调用点零改动(修 B 定案:加固 core,不在调用点打补丁)。

## 场景草案

- 绝对路径 entries + 缺省相对 specsDir → spec id 为文件基名,verdict OK。
- 临时仓真实 CLI:`review` 退出码 0 且 validate 信号非全红(与
  `validate --all` 同判定)。
- 回归:既有相对路径行为逐字节不变(全量 golden/单测守护)。

## Open Questions

无(修 B 已由用户定案,2026-10-18)。
