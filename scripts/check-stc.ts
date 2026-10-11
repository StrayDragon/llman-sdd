#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
// 模板中文文风门(init-generators r97):对 packages/core/templates/zh-Hans 逐文件跑
// STC 检查器(for-instruction-writing profile),errors 计数不得高于
// scripts/stc-baseline.json 的 per-file 上限;基线只许随 change 下调。
// 语义正确性由 template-guidance-parity / template-command-parity / golden 渲染门
// 独立守护,本门只管文风;误报经 stc-disable-next-line 行注释豁免。
// 纯判定逻辑在 check-stc-lib.ts(单测共用)。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { evaluate, parseStcJson, type BaselineDoc } from './check-stc-lib.ts';

const root = join(import.meta.dirname, '..');
const templatesDir = join(root, 'packages', 'core', 'templates', 'zh-Hans');
const baselinePath = join(root, 'scripts', 'stc-baseline.json');
const stcBin = join(root, 'node_modules', '.bin', 'stc');

function collectMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectMarkdown(full));
    else if (entry.endsWith('.md')) out.push(full);
  }
  return out;
}

if (!existsSync(stcBin)) {
  console.error(
    'check-stc: node_modules/.bin/stc 缺失——先 bun install(devDependency @daimonia/stc)',
  );
  process.exit(1);
}
const baselineDoc = JSON.parse(readFileSync(baselinePath, 'utf8')) as BaselineDoc;
const files = collectMarkdown(templatesDir);
const failures: string[] = [];
let totalErrors = 0;

for (const file of files) {
  const key = relative(root, file);
  const proc = spawnSync(
    stcBin,
    ['check', file, '--profile', 'for-instruction-writing', '--json'],
    { encoding: 'utf8', cwd: root },
  );
  const parsed = parseStcJson(proc.status, proc.stdout ?? null);
  if (parsed === null) {
    failures.push(`${key}: stc check 输出不可用(status=${proc.status}) ${proc.stderr ?? ''}`);
    continue;
  }
  const verdict = evaluate(key, parsed.errors, baselineDoc);
  totalErrors += parsed.errors;
  if (!verdict.ok) failures.push(verdict.message);
}

console.log(`check-stc: ${files.length} file(s), ${totalErrors} stc error(s) vs baseline`);
if (failures.length > 0) {
  console.error(`check-stc FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
  process.exit(1);
}
