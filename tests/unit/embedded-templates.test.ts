import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';

import {
  embeddedTemplates,
  makeEmbeddedTemplateIo,
  resolveEmbeddedTable,
  templateKeyFor,
} from '@llman-sdd/core';

const TABLE: Record<string, string> = {
  'en/skills/llman-sdd-explore.md': 'explore-en',
  'zh-Hans/skills/llman-sdd-explore.md': 'explore-zh',
  'shared/review.html': '<!DOCTYPE html><title>review</title>',
};

describe('templateKeyFor', () => {
  test('strips the templates root boundary from source-mode paths', () => {
    expect(
      templateKeyFor('/repo/llman-sdd/packages/core/templates/en/skills/llman-sdd-explore.md'),
    ).toBe('en/skills/llman-sdd-explore.md');
  });

  test('strips the templates root boundary from $bunfs-mode paths', () => {
    expect(templateKeyFor('/templates/en/skills/llman-sdd-explore.md')).toBe(
      'en/skills/llman-sdd-explore.md',
    );
  });

  test('keeps the input unchanged when no /templates/ boundary exists', () => {
    expect(templateKeyFor('/some/other/file.md')).toBe('/some/other/file.md');
  });
});

describe('makeEmbeddedTemplateIo', () => {
  const io = makeEmbeddedTemplateIo(TABLE);

  test('resolves exists/readText through the root-relative table', () => {
    expect(io.exists(join('/templates', 'en/skills/llman-sdd-explore.md'))).toBe(true);
    expect(io.readText(join('/templates', 'en/skills/llman-sdd-explore.md'))).toBe('explore-en');
    expect(io.exists('/templates/zh-Hans/skills/llman-sdd-explore.md')).toBe(true);
    expect(io.exists('/templates/en/units/ghost.md')).toBe(false);
  });

  test('readText throws for keys missing from the table', () => {
    expect(() => io.readText('/templates/en/units/ghost.md')).toThrow(
      /embedded template not found: en\/units\/ghost\.md/u,
    );
  });
});

describe('embeddedTemplates', () => {
  const KEY = 'LLMAN_SDD_EMBEDDED_TEMPLATES';
  const previous = process.env[KEY];

  afterEach(() => {
    if (previous === undefined) delete process.env[KEY];
    else process.env[KEY] = previous;
  });

  test('parses the injected JSON table when present', () => {
    process.env[KEY] = JSON.stringify(TABLE);
    expect(embeddedTemplates()).toEqual(TABLE);
  });

  test('returns undefined when the define is absent', () => {
    delete process.env[KEY];
    expect(embeddedTemplates()).toBeUndefined();
  });

  test('returns undefined when absent is empty', () => {
    process.env[KEY] = '';
    expect(embeddedTemplates()).toBeUndefined();
  });

  test('returns undefined for malformed JSON', () => {
    process.env[KEY] = 'not json {';
    expect(embeddedTemplates()).toBeUndefined();
  });
});

describe('resolveEmbeddedTable', () => {
  test('accepts the plain object inlined by bun define', () => {
    expect(resolveEmbeddedTable(TABLE)).toEqual(TABLE);
  });

  test('accepts a JSON string (other engines or manual env)', () => {
    expect(resolveEmbeddedTable(JSON.stringify(TABLE))).toEqual(TABLE);
  });

  test('rejects undefined, empty string, primitives, and malformed JSON', () => {
    expect(resolveEmbeddedTable(undefined)).toBeUndefined();
    expect(resolveEmbeddedTable('')).toBeUndefined();
    expect(resolveEmbeddedTable('not json {')).toBeUndefined();
    expect(resolveEmbeddedTable(42)).toBeUndefined();
    expect(resolveEmbeddedTable(['a'])).toBeUndefined();
  });
});
