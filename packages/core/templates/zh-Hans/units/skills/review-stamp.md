## 复核戳纪律（re-review stamp → `# reviewed-through:` 头）

复核确认「本 capability 管辖行为不变」时，**只更新** spec 头部的 `# reviewed-through: <change-id>` 一行（改为本次 change id），**禁止**在 rule 块间追加自由 `# re-review(...)` 注释——历史叙事归 `changes/archive/<id>/`，spec 只留机读指针。staleness 据此消警；旧版自由注释随触碰一并机械清理（删除、不搬运）。
