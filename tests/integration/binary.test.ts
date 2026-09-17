import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FREEZE_ARCHIVE_NAME } from '@llman-sdd/core';

// `bun build --compile` 产物冒烟:单文件二进制内 import.meta.url 指向 $bunfs
// 虚拟路径,任何模块加载期的文件相对读取都会 ENOENT(版本读取曾在此崩溃)。
// 模板同样无磁盘副本:build-binary.ts 把 packages/core/templates 以 define
// 注入为 LLMAN_SDD_EMBEDDED_TEMPLATES(in-memory 表),init 与
// review --export-html 经同一 TemplateIo seam 解析——本文件断言该表在
// 编译产物中真实可用。产物不随仓库存在,`just smoke-binary` 先构建再跑;
// CI/qa 直接跳过。
const BIN = join(import.meta.dirname, '..', '..', 'apps', 'cli', 'dist', 'llman-sdd');

test.skipIf(!existsSync(BIN))('compiled binary starts and reports version', () => {
  const version = spawnSync(BIN, ['--version'], { encoding: 'utf8' });
  expect(version.status).toBe(0);
  expect(version.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/u);

  // 模块加载期副作用曾让所有子命令在 --version 之前就崩;抽一个真实命令确认。
  const list = spawnSync(BIN, ['list'], { encoding: 'utf8' });
  expect(list.status).toBe(0);
});

test.skipIf(!existsSync(BIN))('compiled binary init renders skills from the embedded table', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llman-sdd-init-'));
  try {
    const init = spawnSync(BIN, ['init'], { cwd: dir, encoding: 'utf8' });
    expect(init.status).toBe(0);

    // r19 product surface:config + scaffold dirs + managed AGENTS blocks。
    expect(existsSync(join(dir, 'llmanspec', 'config.yaml'))).toBe(true);
    expect(existsSync(join(dir, 'llmanspec', 'specs', '.gitkeep'))).toBe(true);
    expect(existsSync(join(dir, 'llmanspec', 'changes', 'archive', '.gitkeep'))).toBe(true);

    // 默认 en 渲染 10 个默认 skills,且通过 ethics 治理门。
    const skillPath = join(dir, '.agents', 'skills', 'llman-sdd-explore', 'SKILL.md');
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, 'utf8')).toContain('ethics.risk_level');

    const rootAgents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
    expect(rootAgents).toContain('<!-- LLMANSPEC:START -->');
    expect(rootAgents).toContain('<!-- LLMANSPEC:END -->');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test.skipIf(!existsSync(BIN))(
  'compiled binary review --export-html reads the embedded template',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'llman-sdd-review-'));
    try {
      const init = spawnSync(BIN, ['init'], { cwd: dir, encoding: 'utf8' });
      expect(init.status).toBe(0);
      writeFileSync(
        join(dir, 'llmanspec', 'specs', 'seed.feature'),
        [
          '# language: zh-CN',
          '# capability: seed',
          '# purpose: binary smoke fixture',
          '# scope: llmanspec/specs',
          '',
          '功能: seed',
          '  @req:r1 @human',
          '  场景: 基线',
          '    - 占位 MUST 存在',
          '',
        ].join('\n'),
      );

      const review = spawnSync(BIN, ['review', '--export-html', 'report.html'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(review.status).toBe(0);
      const html = readFileSync(join(dir, 'report.html'), 'utf8');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>llman-sdd review');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

test.skipIf(!existsSync(BIN))(
  'compiled binary archive freeze/thaw roundtrip (embedded wasm)',
  () => {
    const dir = mkdtempSync(join(tmpdir(), 'llman-sdd-7z-'));
    try {
      spawnSync(BIN, ['init'], { cwd: dir, encoding: 'utf8' });
      const old = join(dir, 'llmanspec', 'changes', 'archive', '2026-01-01-old');
      mkdirSync(old, { recursive: true });
      writeFileSync(join(old, 'proposal.md'), '---\ndepends_on: []\n---\n\n# old\n');

      const freeze = spawnSync(BIN, ['archive', 'freeze'], { cwd: dir, encoding: 'utf8' });
      expect(freeze.status).toBe(0);
      expect(existsSync(join(dir, 'llmanspec', 'changes', 'archive', FREEZE_ARCHIVE_NAME))).toBe(
        true,
      );
      expect(existsSync(old)).toBe(false);

      const list = spawnSync(BIN, ['archive', 'freeze', '--list'], { cwd: dir, encoding: 'utf8' });
      expect(list.status).toBe(0);
      expect(list.stdout).toContain('2026-01-01-old');

      const thaw = spawnSync(BIN, ['archive', 'thaw', '--change', '2026-01-01-old'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(thaw.status).toBe(0);
      expect(existsSync(join(old, 'proposal.md'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
