// B1 guard tests: localized progress notes resolve correctly and locale
// detection honors the project config (zh-* → zh, else en). Pure + temp-dir
// cases only; stderr emission itself needs no assertion here.
import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectLocale, resolveNote } from '../../apps/cli/src/progress.ts';

test('resolveNote returns locale-matched text for known keys', () => {
  expect(resolveNote('context.retrieve', 'zh')).toBe('正在检索 specs 上下文(LLM)...');
  expect(resolveNote('context.retrieve', 'en')).toBe('Retrieving spec context (LLM)...');
  expect(resolveNote('init.generate', 'en')).toBe('Initializing llmanspec/ and skills...');
});

test('resolveNote is undefined for unknown keys', () => {
  expect(resolveNote('no.such.key', 'en')).toBeUndefined();
});

test('detectLocale reads zh-Hans from config (zh-* → zh)', () => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-progress-'));
  try {
    mkdirSync(join(root, 'llmanspec'));
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: zh-Hans\n');
    expect(detectLocale(root)).toBe('zh');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detectLocale falls back to en without config or with en locale', () => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-progress-'));
  try {
    expect(detectLocale(join(root, 'missing'))).toBe('en');
    mkdirSync(join(root, 'llmanspec'));
    writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: en\n');
    expect(detectLocale(root)).toBe('en');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
