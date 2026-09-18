import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '..', '..', 'apps', 'cli', 'src', 'main.ts');

describe('init CLI compat (r49/r50)', () => {
  test('init into missing nested subdirectory creates it (via CLI contract)', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-initpath-'));
    const target = join(root, 'sub', 'proj');
    const proc = spawnSync('bun', [CLI, 'init', 'sub/proj', '--lang', 'zh-Hans'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(proc.status).toBe(0);
    expect(existsSync(join(target, 'llmanspec', 'config.yaml'))).toBe(true);
    expect(existsSync(join(target, 'AGENTS.md'))).toBe(true);
  });

  test('--lang and --locale are exclusive aliases', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-initlang-'));
    const both = spawnSync('bun', [CLI, 'init', '--locale', 'en', '--lang', 'zh-Hans'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(both.status).not.toBe(0);
    const alias = spawnSync('bun', [CLI, 'init', '--lang', 'zh-Hans'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(alias.status).toBe(0);
    const config = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
    expect(config).toContain('zh-Hans');
  });
});
