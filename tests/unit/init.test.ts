import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { updateFileWithMarkers } from '@llman-sdd/core';

const CLI = join(import.meta.dirname, '..', '..', 'apps', 'cli', 'src', 'main.ts');

/** Mirrors the real flow: renderTemplate trimEnds, so body has no trailing newline. */
const BODY = '# Managed Heading\n\nManaged body.';

describe('updateFileWithMarkers blank-line shape (formatter parity, 0.0.78)', () => {
  test('fresh file: exactly one blank line inside the block, final newline', () => {
    expect(updateFileWithMarkers('', BODY)).toBe(
      '<!-- LLMANSPEC:START -->\n\n# Managed Heading\n\nManaged body.\n<!-- LLMANSPEC:END -->\n',
    );
  });

  test('insert above existing content (Case B): blank line between END and content', () => {
    expect(updateFileWithMarkers('# My Project\n\nSome rules.\n', BODY)).toBe(
      '<!-- LLMANSPEC:START -->\n\n# Managed Heading\n\nManaged body.\n<!-- LLMANSPEC:END -->\n\n# My Project\n\nSome rules.\n',
    );
  });

  test('refresh a 0.2.x-era file (no blanks): both boundaries gain exactly one blank line', () => {
    const stale =
      '<!-- LLMANSPEC:START -->\n# Old body\n<!-- LLMANSPEC:END -->\n# My Project\n\nSome rules.\n';
    expect(updateFileWithMarkers(stale, BODY)).toBe(
      '<!-- LLMANSPEC:START -->\n\n# Managed Heading\n\nManaged body.\n<!-- LLMANSPEC:END -->\n\n# My Project\n\nSome rules.\n',
    );
  });

  test('refresh a 0.0.78-era file (blanks present): existing blanks are preserved', () => {
    const legacy =
      '<!-- LLMANSPEC:START -->\n\n# Old body\n\n<!-- LLMANSPEC:END -->\n\n# My Project\n\nSome rules.\n';
    expect(updateFileWithMarkers(legacy, BODY)).toBe(
      '<!-- LLMANSPEC:START -->\n\n# Managed Heading\n\nManaged body.\n<!-- LLMANSPEC:END -->\n\n# My Project\n\nSome rules.\n',
    );
  });

  test('END at EOF keeps its bare final newline (no trailing blank accumulation)', () => {
    const eof = '<!-- LLMANSPEC:START -->\n# Old\n<!-- LLMANSPEC:END -->\n';
    expect(updateFileWithMarkers(eof, BODY)).toBe(
      '<!-- LLMANSPEC:START -->\n\n# Managed Heading\n\nManaged body.\n<!-- LLMANSPEC:END -->\n',
    );
  });

  test('CRLF file: existing blank after END is preserved verbatim (no LF insertion)', () => {
    const crlf =
      '<!-- LLMANSPEC:START -->\r\n# Old\r\n<!-- LLMANSPEC:END -->\r\n\r\n# My Project\r\n';
    expect(updateFileWithMarkers(crlf, BODY).endsWith('\r\n\r\n# My Project\r\n')).toBe(true);
  });

  test('idempotent across shapes: repeated update produces byte-identical output', () => {
    const inputs = [
      '',
      '# My Project\n\nSome rules.\n',
      '<!-- LLMANSPEC:START -->\n# Old\n<!-- LLMANSPEC:END -->\n# Below\n',
      '<!-- LLMANSPEC:START -->\n\n# Old\n\n<!-- LLMANSPEC:END -->\n\n# Below\n',
      '<!-- LLMANSPEC:START -->\r\n# Old\r\n<!-- LLMANSPEC:END -->\r\n\r\n# Below\r\n',
      '<!-- LLMANSPEC:START -->\n# Old\n<!-- LLMANSPEC:END -->\n',
    ];
    for (const input of inputs) {
      const once = updateFileWithMarkers(input, BODY);
      expect(updateFileWithMarkers(once, BODY)).toBe(once);
    }
  });
});

describe('init managed-block output (CLI end-to-end)', () => {
  const runInit = (root: string, args: string[]) =>
    spawnSync('bun', [CLI, 'init', ...args], { cwd: root, encoding: 'utf8' });

  test('insert: AGENTS.md gets blank lines on both block boundaries', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-initblank-'));
    writeFileSync(join(root, 'AGENTS.md'), '# My Project\n\nSome rules.\n');
    expect(runInit(root, ['--lang', 'zh-Hans']).status).toBe(0);
    const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('<!-- LLMANSPEC:START -->\n\n# ');
    expect(agents).toContain('<!-- LLMANSPEC:END -->\n\n# My Project\n');
  });

  test('update: pre-existing blank lines survive, repeated runs are byte-identical', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-initupd-'));
    const legacy =
      '<!-- LLMANSPEC:START -->\n\n# 旧标题\n\n<!-- LLMANSPEC:END -->\n\n# My Project\n\nSome rules.\n';
    writeFileSync(join(root, 'AGENTS.md'), legacy);
    expect(runInit(root, ['--lang', 'zh-Hans']).status).toBe(0);
    const afterUpdate = readFileSync(join(root, 'AGENTS.md'), 'utf8');
    expect(afterUpdate).toContain('<!-- LLMANSPEC:START -->\n\n# ');
    expect(afterUpdate).toContain('<!-- LLMANSPEC:END -->\n\n# My Project\n');
    expect(runInit(root, ['--update', '--lang', 'zh-Hans']).status).toBe(0);
    expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(afterUpdate);
  });
});

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
