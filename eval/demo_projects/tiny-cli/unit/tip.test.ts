import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('1000 at 15% is 150', () => {
  const r = spawnSync('bun', ['src/main.ts', '1000', '15'], { encoding: 'utf8' });
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toBe('150');
});
