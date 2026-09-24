// r4 BDD runner 就绪合约对账(只读断言,退出码即判定)。
// runner 存在且支持 zh-CN 关键字与 {param:d} 占位符;config.yaml 的
// bdd.run_command 指向 bun test tests/bdd(@executable 发现由 runner 承担)。
import { existsSync, readFileSync } from 'node:fs';

const fail = (message: string): never => {
  console.error(`bdd-runner: ${message}`);
  process.exit(1);
};

if (!existsSync('tests/bdd/runner.ts')) fail('tests/bdd/runner.ts 不存在');
const runner = readFileSync('tests/bdd/runner.ts', 'utf8');
for (const keyword of ['假如', '当', '那么', '而且']) {
  if (!runner.includes(keyword)) fail(`runner 缺 zh-CN 关键字支持 ${keyword}`);
}
if (!runner.includes(':d')) fail('runner 缺 {param:d} 整数占位符语义');

const config = readFileSync('llmanspec/config.yaml', 'utf8');
if (!/run_command:\s*"bun test tests\/bdd"/u.test(config)) {
  fail('bdd.run_command 未指向 bun test tests/bdd');
}
console.log('bdd-runner: r4 contract ok');
