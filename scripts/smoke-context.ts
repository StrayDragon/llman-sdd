/**
 * Real-LLM smoke test for the context retrieval chain (r27-r29 contract):
 * run `context --task` through the v2 CLI against a real chat endpoint and
 * assert the landed output contract.
 *
 * Env-guarded: without LLMAN_SDD_INDEX_CHAT_MODEL the script exits 0 with a
 * skip note (CI-safe). LLMAN_SDD_INDEX_CHAT_API_HOST / _KEY come from the
 * environment (OPENAI_* fallbacks apply). Requires an existing pageindex —
 * one is rebuilt automatically (no LLM needed) when missing/stale.
 *
 * Usage: bun scripts/smoke-context.ts [task...]
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');
const PROBE_TASK =
  process.argv.slice(2).join(' ') ||
  '给 validate 命令新增一条校验规则:禁止在 Rule 块内嵌套场景,违反时输出 ERROR';

const env = process.env as Record<string, string | undefined>;
if (!env.LLMAN_SDD_INDEX_CHAT_MODEL?.trim()) {
  console.log('[smoke-context] LLMAN_SDD_INDEX_CHAT_MODEL unset — skipping (exit 0)');
  process.exit(0);
}

// Keep the index fresh first (rebuild is LLM-free; r26).
const rebuild = spawnSync('bun', [CLI, 'index', 'rebuild'], { cwd: REPO_ROOT, encoding: 'utf8' });
if ((rebuild.status ?? 1) !== 0) {
  console.error(`[smoke-context] index rebuild failed:\n${rebuild.stdout}${rebuild.stderr}`);
  process.exit(1);
}

const started = Date.now();
const proc = spawnSync('bun', [CLI, 'context', '--task', PROBE_TASK], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
const elapsedMs = Date.now() - started;
if ((proc.status ?? 1) !== 0) {
  console.error(`[smoke-context] context exited ${proc.status}:\n${proc.stdout}${proc.stderr}`);
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(proc.stdout);
} catch (error) {
  console.error(
    `[smoke-context] stdout is not JSON: ${(error as Error).message}\n${proc.stdout.slice(0, 400)}`,
  );
  process.exit(1);
}

const result = parsed as {
  status: { ok: boolean; quality: string };
  direct: { id: string }[];
  related: { id: string }[];
  summary: Record<string, unknown>;
};

const problems: string[] = [];
if (!result.status.ok) problems.push(`status.ok is false (${result.status.quality})`);
if (result.status.quality !== 'agentic') problems.push(`quality=${result.status.quality}`);
if (!Array.isArray(result.direct) || !Array.isArray(result.related)) {
  problems.push('direct/related missing');
} else {
  // r28: no spec may appear in both tiers.
  const directIds = new Set(result.direct.map((e) => e.id));
  const dupes = result.related.filter((e) => directIds.has(e.id));
  if (dupes.length > 0)
    problems.push(`cross-tier duplicates: ${dupes.map((e) => e.id).join(', ')}`);
}
const summary = result.summary as
  | { totalSpecs?: number; tierDirect?: number; toolCalls?: number; readRecommended?: string[] }
  | undefined;
if (!summary || typeof summary.totalSpecs !== 'number' || summary.totalSpecs <= 0) {
  problems.push(`summary.totalSpecs invalid: ${JSON.stringify(result.summary)}`);
} else if (!summary.tierDirect || summary.tierDirect < 1) {
  problems.push('summary.tierDirect is empty — probe task matched nothing (check probe/index)');
}

if (problems.length > 0) {
  console.error(`[smoke-context] FAIL (${elapsedMs}ms)\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}

console.log(
  `[smoke-context] PASS (${elapsedMs}ms) quality=agentic totalSpecs=${String(summary?.totalSpecs)} ` +
    `direct=${result.direct.length} related=${result.related.length} toolCalls=${String(summary?.toolCalls)}`,
);
console.log(`[smoke-context] read next: ${summary?.readRecommended?.join(', ')}`);
