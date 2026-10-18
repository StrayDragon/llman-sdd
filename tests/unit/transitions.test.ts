import { describe, expect, test } from 'bun:test';

import { isTransitionOutline, parseCapability, validateAllSpecs } from '@llman-sdd/core';

const HEADER = `# language: zh-CN
# purpose: t
功能: t

`;

function specWith(body: string): string {
  return `${HEADER}  @req:r1
  规则: r
${body}`;
}

/** Minimal valid toggle table used as the base for scoping tests. */
const VALID_TABLE = `    场景大纲: toggle
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | event | to |
        | on | off | off |
        | off | on | on |
`;

/** Island-defect table (sniff-matchable: has from/event/to columns). */
const ISLAND_TABLE = `    场景大纲: island
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | event | to |
        | a | e1 | b |
        | c | e2 | d |
`;

function reportOf(body: string): { failed: boolean; text: string } {
  const doc = parseCapability(specWith(body), 't.feature');
  const report = validateAllSpecs([{ fileName: 'llmanspec/specs/t.feature', doc }]);
  return { failed: report.failed, text: report.lines.join('\n') };
}

describe('transition scoping (r104 tag decision order)', () => {
  test('sniff: island defect without tags is still caught', () => {
    const { failed, text } = reportOf(ISLAND_TABLE);
    expect(failed).toBe(true);
    expect(text).toContain('/transitions/');
    expect(text).toContain('unreachable state');
  });

  test('escape: @no-transitions skips a sniff-matching island table entirely', () => {
    const { failed, text } = reportOf(`    @no-transitions\n${ISLAND_TABLE}`);
    expect(failed).toBe(false);
    expect(text).not.toContain('/transitions/');
  });

  test('force: @transitions fails E1 on a malformed table missing the event column', () => {
    const body = `    @transitions
    场景大纲: partial
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | to |
        | a | b |
`;
    const { failed, text } = reportOf(body);
    expect(failed).toBe(true);
    expect(text).toContain('requires a runnable non-empty Examples table');
  });

  test('conflict: both tags on one scenario is an ERROR', () => {
    const { failed, text } = reportOf(`    @transitions @no-transitions\n${VALID_TABLE}`);
    expect(failed).toBe(true);
    expect(text).toContain('conflicting @transitions and @no-transitions tags');
  });

  test('valid toggle table passes without any tag', () => {
    const { failed } = reportOf(VALID_TABLE);
    expect(failed).toBe(false);
  });
});

describe('transition auto-discovery', () => {
  test('incomplete from/to table is discovered without event column', () => {
    const doc = parseCapability(
      specWith(`    场景大纲: partial
      假如 x
      当 y
      那么 z
      例子:
        | from | to |
        | a | b |
`),
      't.feature',
    );
    const sc = doc.rules[0]?.scenarios[0];
    expect(sc).toBeDefined();
    expect(isTransitionOutline(sc!)).toBe(true);
  });
});

describe('E4 deadlock/trap invariant (r104)', () => {
  test('legal pure cycle passes (every state returns to initial)', () => {
    const { failed, text } = reportOf(`    场景大纲: cycle
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | event | to |
        | on | toggle | off |
        | off | toggle | on |
`);
    expect(failed).toBe(false);
    expect(text).not.toContain('trap state');
  });

  test('absorbing state (A→B, B→B) is a trap with the return-to-initial message', () => {
    const { failed, text } = reportOf(`    场景大纲: absorb
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | event | to |
        | a | e1 | b |
        | b | e2 | b |
`);
    expect(failed).toBe(true);
    expect(text).toContain('cannot return to the initial state');
  });

  test('one-way loop region (A→B, B→C, C→B) flags all trapped states', () => {
    const { failed, text } = reportOf(`    场景大纲: sink-cycle
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | event | to |
        | a | e1 | b |
        | b | e2 | c |
        | c | e3 | b |
`);
    expect(failed).toBe(true);
    expect(text).toContain('cannot return to the initial state');
    expect(text).toContain('b, c');
  });

  test('terminal-reachable deadlock still reports the terminal message', () => {
    const { failed, text } = reportOf(`    场景大纲: deadlock
      假如 在 "<from>"
      当 发 "<event>"
      那么 到 "<to>"
      例子:
        | from | event | to |
        | a | e1 | b |
        | a | e2 | c |
        | b | e3 | b |
`);
    expect(failed).toBe(true);
    expect(text).toContain('cannot reach any terminal state');
  });
});
