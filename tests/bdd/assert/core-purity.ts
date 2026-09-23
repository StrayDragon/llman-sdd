// r3 core 纯域纪律合约对账(只读断言,退出码即判定)。
// oxlint ignorePatterns 忽略生成物与 .agents/skills/;node:fs /
// node:child_process 直连仅限白名单适配器文件(新增直连必须显式更新本
// 白名单——这正是合约锁定的语义)。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fail = (message: string): never => {
  console.error(`core-purity: ${message}`);
  process.exit(1);
};

const oxlint = JSON.parse(
  // .oxlintrc.json 为 JSONC:剥除整行 // 注释后解析
  readFileSync('.oxlintrc.json', 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n'),
) as {
  ignorePatterns?: string[];
};
const ignorePatterns = oxlint.ignorePatterns ?? [];
for (const need of ['.agents/skills/', 'packages/core/templates/', 'dist/']) {
  if (!ignorePatterns.includes(need)) fail(`ignorePatterns 缺 ${need}`);
}

const SIDE_EFFECT_MODULES = ['node:fs', 'node:child_process'] as const;
const ADAPTER_ALLOWLIST = new Set([
  'packages/core/src/archive/sevenzip.ts', // 7z-wasm 适配器(tmpdir 准备)
  'packages/core/src/git/spawnGit.ts', // git 子进程适配器
  'packages/core/src/index.ts', // 嵌入模板读取(define 注入回退)
]);
const CORE_SRC = 'packages/core/src';
const files: string[] = [];
const walk = (rel: string): void => {
  for (const name of readdirSync(join(CORE_SRC, rel))) {
    const child = rel === '' ? name : `${rel}/${name}`;
    if (statSync(join(CORE_SRC, child)).isDirectory()) walk(child);
    else if (child.endsWith('.ts')) files.push(child);
  }
};
walk('');
for (const file of files) {
  if (ADAPTER_ALLOWLIST.has(`${CORE_SRC}/${file}`)) continue;
  const source = readFileSync(join(CORE_SRC, file), 'utf8');
  for (const moduleName of SIDE_EFFECT_MODULES) {
    if (source.includes(`from '${moduleName}'`)) {
      fail(`${CORE_SRC}/${file} 直连 ${moduleName}(MUST 经 ports 注入)`);
    }
  }
}
console.log(`core-purity: r3 contract ok (${String(files.length)} files scanned)`);
