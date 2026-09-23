// r1 工作区布局合约对账(只读断言,退出码即判定;失败逐条报原因)。
// 由 monorepo-structure.feature r1 executable 场景经 smoke 全局步骤
// 「执行命令」驱动。Bun workspaces 布局、core 依赖方向、.bun-version /
// bun.lock 入库与 CI 钉版合同在此锁定(防静默删除)。
import { existsSync, readFileSync } from 'node:fs';

const fail = (message: string): never => {
  console.error(`monorepo-layout: ${message}`);
  process.exit(1);
};

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { workspaces?: string[] };
const workspaces = pkg.workspaces ?? [];
const covers = (target: string): boolean =>
  workspaces.some(
    (pattern) =>
      pattern === target || (pattern.endsWith('/*') && target.startsWith(pattern.slice(0, -1))),
  );
if (!covers('packages/core')) fail('root workspaces 未覆盖 packages/core');
if (!covers('apps/cli')) fail('root workspaces 未覆盖 apps/cli');

const corePkg = JSON.parse(readFileSync('packages/core/package.json', 'utf8')) as {
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
if (!JSON.stringify(corePkg.exports ?? {}).includes('.ts')) {
  fail('core 包 exports 未直指 .ts 源码(不得引入构建步骤)');
}
for (const deps of [corePkg.dependencies, corePkg.devDependencies, corePkg.peerDependencies]) {
  const strangers = Object.keys(deps ?? {}).filter((name) => /^apps\/|@llman-sdd\/cli/u.test(name));
  if (strangers.length > 0) fail(`packages/core 依赖了 apps/* 工作区: ${strangers.join(', ')}`);
}

if (!existsSync('.bun-version')) fail('.bun-version 不存在');
if (!existsSync('bun.lock')) fail('bun.lock 未入库');
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
if (!ci.includes('bun-version-file: .bun-version')) fail('CI 未以 .bun-version 文件钉版');
if (!ci.includes('--frozen-lockfile')) fail('CI 未使用 --frozen-lockfile 安装');
console.log('monorepo-layout: r1 contract ok');
