// check-stc 纯逻辑(供 scripts/check-stc.ts 与 tests/unit/check-stc.test.ts 共用):
// 判定与解析不带 IO,便于单测;进程编排留在 check-stc.ts。

export interface StcJson {
  errors: number;
  warnings?: number;
}

export interface BaselineDoc {
  note?: string;
  baseline: Record<string, number>;
}

export interface Verdict {
  ok: boolean;
  /** ok 时为人读摘要;失败时为失败原因(含修复指引)。 */
  message: string;
}

export function evaluate(key: string, errors: number, doc: BaselineDoc): Verdict {
  const max = doc.baseline[key];
  if (max === undefined) {
    return {
      ok: false,
      message: `${key}: 基线缺键(新增文件须入 stc-baseline.json,上限按当前 errors 记)`,
    };
  }
  if (errors > max) {
    return {
      ok: false,
      message: `${key}: ${errors} > 基线 ${max} —— 文风漂移;修复或随 change 下调基线并附理由`,
    };
  }
  return { ok: true, message: `${key}: ${errors}/${max}` };
}

/** stc check --json 在 errors>0 时退出码为 1(status=1)但 stdout 合法——仅无 stdout 或坏 JSON 视为失败。 */
export function parseStcJson(status: number | null, stdout: string | null): StcJson | null {
  if (stdout === null || stdout === '') return null;
  try {
    const doc = JSON.parse(stdout) as Partial<StcJson>;
    if (typeof doc.errors !== 'number') return null;
    return { errors: doc.errors, warnings: doc.warnings };
  } catch {
    void status;
    return null;
  }
}
