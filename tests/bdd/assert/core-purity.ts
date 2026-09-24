// r3 core 纯域纪律合约对账(只读断言,退出码即判定)。
// oxlint ignorePatterns 忽略生成物与 .agents/skills/;node:fs /
// node:child_process 直连仅限白名单适配器文件;process.* 读取与无参墙钟
// (Date.now / new Date())同属副作用,剥离注释后逐文件检出(白名单已清零,
// 全部 core 源码须经参数/接口注入)。
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
  'packages/core/src/git/spawnGit.ts', // git 子进程适配器
]);

// 过渡白名单已由 align-report-cli-surface 清零:core 全部源码不再豁免
// process.* / 墙钟检查(新增直连会直接 FAIL)。

/** 剥离 // 行注释与块注释后的源码(注释里的 process./Date 不计违规)。 */
function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/u, ''))
    .join('\n');
}

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
  const fullPath = `${CORE_SRC}/${file}`;
  if (ADAPTER_ALLOWLIST.has(fullPath)) continue;
  const source = readFileSync(join(CORE_SRC, file), 'utf8');
  for (const moduleName of SIDE_EFFECT_MODULES) {
    if (source.includes(`from '${moduleName}'`)) {
      fail(`${fullPath} 直连 ${moduleName}(MUST 经 ports 注入)`);
    }
  }
  const code = stripComments(source);
  if (/\bprocess\./u.test(code)) {
    fail(`${fullPath} 读取 process.*(MUST 经参数/接口注入)`);
  }
  if (/\bDate\.now\(\)|new Date\(\s*\)/u.test(code)) {
    fail(`${fullPath} 使用无参墙钟 Date(MUST 经参数/接口注入)`);
  }
}
console.log(`core-purity: r3 contract ok (${String(files.length)} files scanned)`);
