# 设计备忘：drop-capability-header

## spec id 分配算法

输入：实例根 `llmanspec/specs/` 下全部 `**/*.feature`，`rel` 为相对 specs 根的 POSIX 路径。

**偏好 `preferred`（每文件）**

1. `rel` 为单段 `\<stem\>.feature` → `preferred = stem`
2. `rel` 为两段 `\<d\>/\<stem\>.feature` 且 `d === stem` → `preferred = stem`
3. 否则 → `preferred = rel` 去掉 `.feature` 后缀

**消歧**

- 统计每个 `preferred` 出现次数。
- 唯一 → `specId = preferred`
- 重复 → 该组内每个文件 `specId = rel` 无 `.feature` 后缀

**终态**

- 分配后 `specId` 重复 → validate ERROR

**示例**

| 文件 | specId |
|------|--------|
| `cli.feature` | `cli` |
| `auth/auth.feature`（无撞名） | `auth` |
| `cli.feature` + `legacy/cli.feature` | `cli`、`legacy/cli` |

## 模块边界

- `assignSpecIds(entries, specsRoot)` 纯函数，返回 `Map<fileName, specId>` 或给 `SpecEntry` 附加 `specId` 字段。
- `specIdOf(entry)` 改为读 `entry.specId`（分配后）；未分配时仅用于单测内联解析的兼容可保留 filename 回退并标 deprecated。
- `parseCapability` 不再门禁 `capability` 头；`purpose` 门禁保留。

## 迁移

- 扩展 `stripLegacyHeaders` 匹配 `# capability:` 行（与 scope/reviewed-through 同幂等语义）。
- `migrations/v0.8-v0.9/README.md` + `migrateNotes` 注册版本对。

## 否决

- 用 Gherkin `feature.description` 替代 `# purpose:` — 探索已定保留 purpose 头。
- 撞名时仅子目录文件升格路径 id、扁平保留短名 — 规则不统一，已否决。
