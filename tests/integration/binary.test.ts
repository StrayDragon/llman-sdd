import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// `bun build --compile` 产物冒烟:单文件二进制内 import.meta.url 指向 $bunfs
// 虚拟路径,任何模块加载期的文件相对读取都会 ENOENT(版本读取曾在此崩溃)。
// 产物不随仓库存在,`just smoke-binary` 先构建再跑;CI/qa 直接跳过。
const BIN = join(import.meta.dirname, '..', '..', 'apps', 'cli', 'dist', 'llman-sdd');

test.skipIf(!existsSync(BIN))('compiled binary starts and reports version', () => {
  const version = spawnSync(BIN, ['--version'], { encoding: 'utf8' });
  expect(version.status).toBe(0);
  expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);

  // 模块加载期副作用曾让所有子命令在 --version 之前就崩;抽一个真实命令确认。
  const list = spawnSync(BIN, ['list'], { encoding: 'utf8' });
  expect(list.status).toBe(0);
});
