import { expect, test } from 'bun:test';
// eval-playbook r86:auth 注入链纯函数——路径解析/缺失容错/拷贝成功;wrapper 条件 cp 行在库。
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { copyAuthIfExists, resolveAuthJsonPath } from '../../eval/auth.ts';
import { REPO_ROOT } from '../helpers/spawn.ts';

test('resolveAuthJsonPath joins home with .pi/agent/auth.json', () => {
  expect(resolveAuthJsonPath('/h')).toBe('/h/.pi/agent/auth.json');
  const implicit = resolveAuthJsonPath();
  expect(implicit.endsWith('.pi/agent/auth.json')).toBe(true);
});

test('copyAuthIfExists tolerates missing host auth (no throw, message hints)', () => {
  const emptyHome = mkdtempSync(join(tmpdir(), 'eval-auth-empty-'));
  const destDir = join(emptyHome, 'pi-config');
  const r = copyAuthIfExists(destDir, join(emptyHome, 'no-such-home'));
  expect(r.copied).toBe(false);
  expect(r.message).toContain('跳过 auth 注入');
  expect(existsSync(join(destDir, 'auth.json'))).toBe(false);
});

test('copyAuthIfExists copies when host auth exists', () => {
  const home = mkdtempSync(join(tmpdir(), 'eval-auth-home-'));
  const destDir = mkdtempSync(join(tmpdir(), 'eval-auth-dest-'));
  const authDir = join(home, '.pi', 'agent');
  mkdirSync(authDir, { recursive: true });
  writeFileSync(join(authDir, 'auth.json'), '{"zai-coding-cn":{"type":"api_key","key":"k"}}');
  const r = copyAuthIfExists(destDir, home);
  expect(r.copied).toBe(true);
  expect(readFileSync(join(destDir, 'auth.json'), 'utf8')).toContain('zai-coding-cn');
});

test('wrapper conditionally copies auth.json (r86 guard)', () => {
  const text = readFileSync(
    join(REPO_ROOT, 'eval', 'tasks', 'playbook', 'environment', 'pi-wrapper.sh'),
    'utf8',
  );
  expect(text).toContain('auth.json');
});
