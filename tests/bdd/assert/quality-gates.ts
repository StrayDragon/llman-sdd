// r2 质量门禁合约对账(只读断言,退出码即判定)。
// justfile check/qa 聚合门面 + 聚合门指向的 oxlint/oxfmt 脚本 + prek
// pre-commit hook 面(oxlint、oxfmt --write、whitespace 系)在此锁定。
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

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts?: Record<string, string>;
};
const scripts = pkg.scripts ?? {};
if (scripts['lint'] !== 'oxlint') fail(`lint script 漂移: ${String(scripts['lint'])}`);
if (scripts['format:check'] !== 'oxfmt --check') {
  fail(`format:check script 漂移: ${String(scripts['format:check'])}`);
}
if (scripts['qa'] !== 'bun run check && bun run test') {
  fail(`qa script 未聚合 check + test: ${String(scripts['qa'])}`);
}

const preCommit = readFileSync('.pre-commit-config.yaml', 'utf8');
if (!preCommit.includes('name: oxlint')) fail('pre-commit 缺 oxlint local hook');
if (!preCommit.includes('name: oxfmt --write')) fail('pre-commit 缺 oxfmt --write local hook');
for (const hook of ['trailing-whitespace', 'end-of-file-fixer']) {
  if (!preCommit.includes(hook)) fail(`pre-commit 缺 whitespace 系检查 ${hook}`);
}
console.log('quality-gates: r2 contract ok');
