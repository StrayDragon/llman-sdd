## Re-review stamp discipline (`# reviewed-through:` header)

When a review concludes "no governed behaviour change", **update** the spec header line `# reviewed-through: <change-id>` to this change — **never** append free-form `# re-review(...)` comments between rules (historical narrative belongs to `changes/archive/<id>/`; the spec keeps only the machine-readable pointer). Staleness consumes it to clear the STALE signal; legacy free-form comments are dropped mechanically on touch, not migrated.
