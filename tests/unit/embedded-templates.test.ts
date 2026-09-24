import { describe, expect, test } from 'bun:test';
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
  test('parses the injected JSON table when present', () => {
    expect(embeddedTemplates(JSON.stringify(TABLE))).toEqual(TABLE);
  });

  test('returns undefined when the define value is absent', () => {
    expect(embeddedTemplates(undefined)).toBeUndefined();
  });

  test('returns undefined when the define value is empty', () => {
    expect(embeddedTemplates('')).toBeUndefined();
  });

  test('returns undefined for malformed JSON', () => {
    expect(embeddedTemplates('not json {')).toBeUndefined();
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
