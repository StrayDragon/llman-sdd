import { describe, expect, test } from 'bun:test';

import { discoverSpecs, validateAllSpecs, type DiscoveryIo, type SpecEntry } from '@llman-sdd/core';
import { parseCapability } from '@llman-sdd/core';

const io: DiscoveryIo = {
  exists: (p) => p.startsWith('llmanspec/') || p.startsWith('src/'),
  isDirectory: (p) => !p.endsWith('.feature') && p.startsWith('llmanspec/'),
  listDir: (p) =>
    p === 'llmanspec/specs' || p === 'llmanspec/specs/'
      ? ['a.feature', 'b.feature', 'sub']
      : p === 'llmanspec/specs/sub' || p === 'llmanspec/specs/sub/'
        ? ['c.feature']
        : [],
  readText: (p) => {
    const body = (cap: string, req: string): string =>
      `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n\n  @req:${req} @human\n  场景: ok\n    - 系统 MUST x\n`;
    if (p.endsWith('a.feature')) return body('a', 'r1');
    if (p.endsWith('b.feature')) return body('b', 'r2');
    return body('c', 'r3');
  },
};

describe('discoverSpecs', () => {
  test('walks nested dirs via injected io', () => {
    const entries = discoverSpecs('llmanspec/specs/', io);
    expect(entries.map((e) => e.fileName)).toEqual([
      'llmanspec/specs/a.feature',
      'llmanspec/specs/b.feature',
      'llmanspec/specs/sub/c.feature',
    ]);
  });
});

describe('validateAllSpecs', () => {
  test('clean specs pass with v1-style report lines', () => {
    const entries: SpecEntry[] = [
      { fileName: 'a.feature', doc: parseCapability(io.readText('a.feature'), 'a.feature') },
    ];
    const report = validateAllSpecs(entries, io);
    expect(report.failed).toBe(false);
    expect(report.lines.at(-1)).toBe('Totals: 1 passed, 0 failed (1 items)');
    expect(report.lines[0]).toBe('OK spec/a');
  });

  test('@human without MUST word fails (v1 parity)', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: t\n# purpose: p\n# scope: llmanspec/\n\n功能: t\n\n  @req:r1 @human\n  场景: ok\n    - 系统提供 x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(true);
    expect(report.lines).toContain('FAIL spec/t');
    expect(report.lines.join('\n')).toInclude('constraint statement must contain MUST/SHALL');
  });

  test('@human without @req tag fails (v1 parity)', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: t\n# purpose: p\n# scope: llmanspec/\n\n功能: t\n\n  @human\n  场景: ok\n    - 系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.lines.join('\n')).toInclude(
      '@human constraint scenario must carry an @req:<req_id> tag',
    );
  });

  test('valid_scope missing on disk fails', () => {
    const doc = parseCapability(
      `# language: zh-CN\n# capability: t\n# purpose: p\n# scope: nope/\n\n功能: t\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.lines.join('\n')).toInclude('valid_scope path(s) do not exist on disk: nope/');
  });

  test('duplicate req ids fail every involved capability', () => {
    const mk = (cap: string): SpecEntry => ({
      fileName: `${cap}.feature`,
      doc: parseCapability(
        `# language: zh-CN\n# capability: ${cap}\n# purpose: p\n# scope: llmanspec/\n\n功能: ${cap}\n\n  @req:r9 @human\n  场景: ok\n    - 系统 MUST x\n`,
        `${cap}.feature`,
      ),
    });
    const report = validateAllSpecs([mk('a'), mk('b')], io);
    expect(report.lines[0]).toBe('FAIL spec/a');
    expect(report.lines.filter((l) => l === 'FAIL spec/b')).toHaveLength(1);
    expect(report.lines.at(-1)).toBe('Totals: 0 passed, 2 failed (2 items)');
  });

  test('missing capability header fails; missing purpose only warns', () => {
    const doc = parseCapability(
      `# scope: llmanspec/\n\n功能: t\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n`,
    );
    const report = validateAllSpecs([{ fileName: 't.feature', doc }], io);
    expect(report.failed).toBe(true);
    const joined = report.lines.join('\n');
    expect(joined).toInclude('missing `# capability:` header comment');
    expect(joined).toInclude('[WARNING] file: missing `# purpose:` header comment');
  });
});
