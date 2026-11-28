import { describe, expect, test } from 'bun:test';

import {
  createMachineDraft,
  extractStudioMachines,
  markMachineRemoved,
  parseCapability,
  type SpecEntry,
} from '@llman-sdd/core';

const ZH_ORDER_SPEC = `# language: zh-CN
# purpose: 订单流转规范

功能: order

  @req:r1
  规则: 订单主状态机
    订单 MUST 遵循状态流转。

    场景大纲: 订单生命周期
      假如 当前处于 <初始状态> 且满足 <守卫>
      当 触发 <事件>
      那么 进入 <目标状态>
      例子:
        | 初始状态 | 事件 | 守卫 | 目标状态 |
        | 待支付 | 付款 | 余额足够 | 已支付 |
        | 已支付 | 发货 |  | 已发货 |

    @no-transitions
    场景大纲: 忽略的普通参数表
      假如 <初始状态>
      当 <事件>
      那么 <目标状态>
      例子:
        | 初始状态 | 事件 | 目标状态 |
        | a | e | b |

    @transitions
    @no-transitions
    场景大纲: 冲突标签应跳过
      假如 <初始状态>
      当 <事件>
      那么 <目标状态>
      例子:
        | 初始状态 | 事件 | 目标状态 |
        | x | e | y |
`;

const EN_JOB_SPEC = `# language: en
# purpose: Job lifecycle spec

Feature: job

  @req:r2
  Rule: Job execution transitions
    Jobs MUST transition deterministically.

    @transitions
    Scenario Outline: job lifecycle
      Given state is <from>
      When event <event> occurs
      Then state becomes <to>
      Examples:
        | from | event | to |
        | idle | run | running |
        | running | finish | done |
`;

function entryOf(fileName: string, source: string, specId: string): SpecEntry {
  return {
    fileName,
    specId,
    doc: parseCapability(source, fileName),
  };
}

describe('studio/extract (r128)', () => {
  test('extracts Chinese and English transition tables, preserves column families, and skips escaped/conflicting outlines', () => {
    const entries = [
      entryOf('llmanspec/specs/order.feature', ZH_ORDER_SPEC, 'order'),
      entryOf('llmanspec/specs/job.feature', EN_JOB_SPEC, 'job'),
    ];
    const extracted = extractStudioMachines(entries);
    expect(extracted).toHaveLength(2);

    const order = extracted[0]!;
    expect(order.machine.machineKey).toBe('order/r1/订单生命周期');
    expect(order.machine.columns).toEqual({
      from: '初始状态',
      event: '事件',
      to: '目标状态',
      guard: '守卫',
    });
    expect(order.machine.states.map((s) => s.name)).toEqual(['待支付', '已支付', '已发货']);
    expect(order.machine.initialStateUid).toBe('s1');
    expect(order.machine.transitions).toHaveLength(2);
    expect(order.machine.transitions[0]?.guard).toBe('余额足够');
    expect(order.machine.transitions[1]?.guard).toBeUndefined();
    expect(order.draft.mode).toBe('modify');
    expect(order.draft.baseline).toEqual(order.machine);
    expect(order.draft.current).toEqual(order.machine);
    expect(order.draft.sourceFile).toBe('llmanspec/specs/order.feature');

    const job = extracted[1]!;
    expect(job.machine.machineKey).toBe('job/r2/job lifecycle');
    expect(job.machine.columns).toEqual({ from: 'from', event: 'event', to: 'to' });
    expect(job.machine.states.map((s) => s.name)).toEqual(['idle', 'running', 'done']);
  });

  test('supports 0 -> 1 create draft with null baseline and remove mode marking', () => {
    const created = createMachineDraft({
      capability: 'refund',
      reqId: 'r900',
      ruleTitle: '退款状态流转',
      scenarioName: '退款流程',
      states: [{ name: '申请中', initial: true }, { name: '已退款' }, { name: '已拒绝' }],
      transitions: [
        { from: '申请中', event: '通过', guard: '风控通过', to: '已退款' },
        { from: '申请中', event: '拒绝', to: '已拒绝' },
      ],
    });

    expect(created.mode).toBe('create');
    expect(created.baseline).toBeNull();
    expect(created.sourceFile).toBe('llmanspec/specs/refund.feature');
    expect(created.current?.columns).toEqual({
      from: '初始状态',
      event: '事件',
      to: '目标状态',
      guard: '守卫',
    });
    expect(created.current?.initialStateUid).toBe('s1');

    const modified = {
      ...created,
      mode: 'modify' as const,
      baseline: created.current,
    };
    const removed = markMachineRemoved(modified);
    expect(removed.mode).toBe('remove');
    expect(removed.current).toBeNull();
    expect(removed.baseline).not.toBeNull();
  });
});
