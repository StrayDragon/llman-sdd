// r2 质量门禁合约对账(只读断言,退出码即判定)。
// justfile check/qa 聚合门面 + 聚合门指向的 oxlint/oxfmt 脚本 + prek
// pre-commit hook 面(oxlint、oxfmt --write、whitespace 系)在此锁定;
// qa 门禁集合(check/test/skills 模板渲染/pending/schema)在 justfile、package.json、
// ci.yml 三处的接线一致性亦在此锁定(缺项逐项报出)。
import { readFileSync } from 'node:fs';

const fail = (message: string): never => {
  console.error(`quality-gates: ${message}`);
  process.exit(1);
};

const just = readFileSync('justfile', 'utf8');
if (!/^check:/mu.test(just)) fail('justfile 缺 check 聚合门');
if (!/^qa: check$/mu.test(just)) fail('justfile qa 未聚合 check');
for (const item of ['typecheck', 'lint', 'format:check']) {
  if (!just.includes(item)) fail(`justfile check 门缺 ${item}`);
}

// justfile qa recipe 体(「qa: check」行之后连续的缩进行)必须调用三个脚本门
const justLines = just.split('\n');
const qaStart = justLines.findIndex((line) => /^qa: check$/u.test(line));
if (qaStart < 0) fail('justfile 缺 qa: check recipe');
const qaBody: string[] = [];
for (const line of justLines.slice(qaStart + 1)) {
  if (line.startsWith('    ') || line === '') qaBody.push(line);
  else break;
}
const qaBodyText = qaBody.join('\n');
for (const gate of ['test', 'check-skills-template-render', 'pending-gate', 'check:schema']) {
  if (!qaBodyText.includes(gate)) fail(`justfile qa 门缺 ${gate}`);
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts?: Record<string, string>;
};
const scripts = pkg.scripts ?? {};
if (scripts['lint'] !== 'oxlint') fail(`lint script 漂移: ${String(scripts['lint'])}`);
if (scripts['format:check'] !== 'oxfmt --check') {
  fail(`format:check script 漂移: ${String(scripts['format:check'])}`);
}
const QA_SCRIPT =
  'bun run check && bun run test && bun run check:skills-template-render && bun run pending-gate && bun run check:schema';
if (scripts['qa'] !== QA_SCRIPT) {
  fail(
    `qa script 未聚合 check + test + check:skills-template-render + pending-gate + check:schema: ${String(scripts['qa'])}`,
  );
}
if (scripts['pending-gate'] !== 'bun scripts/pending-gate.ts') {
  fail(`pending-gate script 漂移: ${String(scripts['pending-gate'])}`);
}

// CI 必须运行与本地 qa 同一集合(check 三项 + test + 三个脚本门)
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const runSteps = new Set(
  [...ci.matchAll(/^[ \t]*- run:[ \t]*(.+)$/gmu)].map((m) => m[1]?.trim() ?? ''),
);
for (const step of [
  'bun run typecheck',
  'bun run lint',
  'bun run format:check',
  'bun test tests/',
  'bun run check:skills-template-render',
  'bun run pending-gate',
  'bun run check:schema',
]) {
  if (!runSteps.has(step)) fail(`ci.yml 缺 run 步 ${step}`);
}

const preCommit = readFileSync('.pre-commit-config.yaml', 'utf8');
if (!preCommit.includes('name: oxlint')) fail('pre-commit 缺 oxlint local hook');
if (!preCommit.includes('name: oxfmt --write')) fail('pre-commit 缺 oxfmt --write local hook');
for (const hook of ['trailing-whitespace', 'end-of-file-fixer']) {
  if (!preCommit.includes(hook)) fail(`pre-commit 缺 whitespace 系检查 ${hook}`);
}
console.log('quality-gates: r2 contract ok');
