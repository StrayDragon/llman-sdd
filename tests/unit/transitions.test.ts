import { describe, expect, test } from 'bun:test';

import { isTransitionOutline, parseCapability, validateAllSpecs } from '@llman-sdd/core';

describe('transition auto-discovery', () => {
  test('incomplete from/to table is discovered without event column', () => {
    const source = `# language: zh-CN
# purpose: t
功能: t

  @req:r1
  规则: r
    场景大纲: partial
      假如 x
      当 y
      那么 z
      例子:
        | from | to |
        | a | b |
`;
    const doc = parseCapability(source, 't.feature');
    const sc = doc.rules[0]?.scenarios[0];
    expect(sc).toBeDefined();
    expect(isTransitionOutline(sc!)).toBe(true);
  });

  test('check_transitions flags incomplete table as ERROR', () => {
    const source = `# language: zh-CN
# purpose: partial-cap
功能: partial-cap

  @req:r1
  规则: r
    场景大纲: partial
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | to |
        | a | b |
`;
    const doc = parseCapability(source, 'partial-cap.feature');
    const report = validateAllSpecs(
      [{ fileName: 'llmanspec/specs/partial-cap.feature', doc }],
      { exists: () => true },
      { checkTransitions: true },
    );
    expect(report.failed).toBe(true);
    expect(report.lines.join('\n')).toContain('/transitions/');
  });
});
