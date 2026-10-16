# Design: migrate-prompt-per-version

## D1 注册表键从「版本对」改为「单版本」（否决模糊匹配版本对）

备选：保留 pair 键 + 前缀/窗口模糊匹配（`0.8.2->0.9.0` 命中 `0.8.1->0.9.0`）。否决：
配对键仍要求发版时预判并登记用户可能传入的 from 版本（0.8.1、0.8.2、…），登记面随
中间版本线性增长；且"窗口归属"（迁移属于哪个发版）是单一事实，配对表达的是派生量。
per-version 键让每个发版声明自己的 breaking 面，范围查询 `(from, to]` 纯粹是注册表
上的区间过滤，无预登记、无特例。

## D2 版本归属：r101 条目留在 0.9.0

`drop-capability-header` 的代码实际随 v0.8.2 发布，但仓库叙事（migrations README、
注册表窗口、CHANGELOG 规划）一致将其归入 0.9.0 窗口。为避免重写历史归因，条目挂
`0.9.0`：从任意 0.8.x 升到 0.9.0 的用户都会拿到该手册（步骤幂等，重复执行无害），
从 0.9.0+ 起不再出现。`0.8.0` 条目承接原 `0.7.5->0.8.0` 内容不变。

## D3 范围语义：`(from, to]` 左开右闭，数值语义比较

- 版本格式严格 `x.y.z`（数字三段）；解析失败或 `from >= to` 报 ERROR；
- 聚合 = 注册表中满足 `from < version <= to` 的全部版本，按 version 升序输出；
- **空范围退出码 0**：输出 `No documented migrations for <from> -> <to>.`——旧版对
  未注册版本对报错正是本次要修的体验缺陷，合法范围无登记是正常状态不是错误。

## D4 输出格式：版本头 + 条目 + 分割线

```
# Migration playbook: <from> -> <to>

## <version>

### <item title>

背景一句话。

#### Steps

1. …

#### Verification checklist

- [ ] …

---

## <version 2>
…
```

保留现有手册骨架（英文、steps 编号、checklist 复选框），版本间 `---` 分隔；条目间空行
分隔（不加分隔线，避免与版本级分割线混淆）。确定性渲染：同一范围两次输出逐字节一致。

## D5 废弃策略：软废弃 + 冲突报错（否决直接删除）

沿 house 先例（`bdd:` 段提升、`check_transitions` 剥离）：旧旗标继续可用，stderr 输出
一次 WARNING 指引 `--from-version/--to-version`。0.9.0 是该命令诞生后的第二个窗口，
直接删除会让 0.8.x 期的外部脚本/文档即刻断链。`--version-expr` 与新旗标同给报冲突错
（与 `--locale/--lang` 同给报错的先例一致）；`strip-legacy-headers` 拒绝任何选择旗标。

## D6 总览输出随键更换

裸 `project migrate` 的追加段从「已知版本对清单」改为「已知迁移版本清单」+ 新旗标用法
示例；`0.7.5->0.8.0` 与 `0.8.1->0.9.0` 两个 pair id 不再出现于任何 CLI 输出。

## 测试 seam

复用既有两面：`tests/unit/migrate-prompt.test.ts`（core 导出的解析/聚合/渲染纯函数）
与 `tests/bdd/steps/migrate-scope.ts`（CLI 子进程驱动 r100 场景：聚合输出、空范围、
非法输入、废弃 WARNING）。无新 seam。
