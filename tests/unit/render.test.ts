import { describe, expect, test } from 'bun:test';

import { renderMachine } from '@llman-sdd/core';
import { decode } from '@toon-format/toon';

// add-render-layer:单一机器格式渲染器。IR 与各命令 `--json` 的历史载荷同形,
// json pretty 必须与手写期字节一致;toon 经官方编码器,round-trip 无损。
describe('renderMachine', () => {
  const ir = {
    items: [
      { id: 'a', type: 'spec', valid: true, issues: [] },
      {
        id: 'b',
        type: 'change',
        valid: false,
        issues: [{ level: 'ERROR', path: 'x', message: 'm' }],
      },
    ],
    summary: { totals: { items: 2, passed: 1, failed: 1 } },
    version: '1.0',
  };

  test('json: 2-space pretty, no trailing newline', () => {
    const out = renderMachine(ir, 'json');
    expect(out).toBe(JSON.stringify(ir, null, 2));
    expect(out.endsWith('\n')).toBe(false);
  });

  test('compact-json: single minified line', () => {
    const out = renderMachine(ir, 'compact-json');
    expect(out).toBe(JSON.stringify(ir));
    expect(out.includes('\n')).toBe(false);
  });

  test('toon: lossless round-trip back to the IR', () => {
    const out = renderMachine(ir, 'toon');
    expect(out).toInclude('items[2]:');
    expect(decode(out)).toEqual(ir);
  });

  test('toon: unicode and punctuation-heavy fields survive round-trip', () => {
    const zh = {
      signals: [
        {
          kind: 'validate',
          capability: '界面渲染',
          count: 1,
          detail: '失败原因: 含逗号, 引号 "x", 换行伪装',
        },
        { kind: 'pending', capability: 'app-tui-host', count: 0, detail: '' },
      ],
      summary: { criticalCount: 0, warningCount: 1 },
    };
    expect(decode(renderMachine(zh, 'toon'))).toEqual(zh);
  });

  test('toon: empty arrays and nested uniform tables keep shape', () => {
    const edge = { changes: [], gates: [{ name: 'clean-tree', pass: true, hint: '' }] };
    expect(decode(renderMachine(edge, 'toon'))).toEqual(edge);
  });
});
