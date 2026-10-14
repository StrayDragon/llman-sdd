import { describe, expect, test } from 'bun:test';

import { stripLegacyHeaderLines } from '@llman-sdd/core';

describe('stripLegacyHeaderLines (r100 migrate-scope core)', () => {
  const SRC = [
    '# capability: legacy',
    '# purpose: p',
    '# scope: src/',
    '# reviewed-through: c12',
    '',
    '功能: legacy',
    '',
    '  @req:r1',
    '  规则: 规则',
    '    描述',
    '',
  ].join('\n');

  test('removes both legacy header lines, keeps the rest byte-identical', () => {
    const result = stripLegacyHeaderLines(SRC);
    expect(result.removed).toBe(2);
    expect(result.content).toBe(
      '# capability: legacy\n# purpose: p\n\n功能: legacy\n\n  @req:r1\n  规则: 规则\n    描述\n',
    );
  });

  test('idempotent: second pass removes nothing', () => {
    const once = stripLegacyHeaderLines(SRC);
    const twice = stripLegacyHeaderLines(once.content);
    expect(twice.removed).toBe(0);
    expect(twice.content).toBe(once.content);
  });

  test('indented variants and mid-file comment lines are out of scope', () => {
    const result = stripLegacyHeaderLines('a\n  # scope: indent? no\nb\n#scope: tight\n');
    // `#scope:` (no space) still matches the bare `#` + name shape; indented
    // comment lines are ordinary comments and stay.
    expect(result.removed).toBe(1);
    expect(result.content).toBe('a\n  # scope: indent? no\nb\n');
  });
});
