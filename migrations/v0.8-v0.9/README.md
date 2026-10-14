# v0.8 → v0.9 迁移：移除 `# capability:` 头，spec id 由路径全局分配

0.9.0 起 spec 头契约仅为 `# language:` + `# purpose:`；capability / spec id 在单个
`llmanspec/specs/` 实例内由 discover 扫描全部 `.feature` 后按 r101 算法分配（扁平与
目录式可混搭，撞名时升格为相对路径 id）。`功能:` 标题必须等于分配后的 id。

## 破坏面

1. **spec 头格式**：`# capability:` 不再结构化解析；`strip-legacy-headers` 会剥除该行。
2. **spec id 口径**：CLI `show`/`validate`/`spec add-req` 的 capability 参数以分配后的 id 为准，不再读头注释。
3. **校验**：缺 purpose、功能标题与 spec id 不一致、分配后重复 spec id → ERROR。

## 升级步骤

```bash
llman-sdd project migrate prompt --version-expr '0.8.1->0.9.0'

llman-sdd project migrate strip-legacy-headers --dry-run
llman-sdd project migrate strip-legacy-headers

llman-sdd init --update
llman-sdd validate --all --strict
```
