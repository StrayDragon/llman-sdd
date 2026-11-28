import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SYNC_BOTH_BLOCKED_REASON,
  applySyncPicks,
  buildForestGraph,
  buildSyncItems,
  cloneMachineIR,
  computeMachineDiff,
  extractDecisionTables,
  extractStudioMachines,
  formatSemanticDiff,
  parseCapability,
  renderUpdatedFeatureSource,
  validateAllSpecs,
  validateFlowAndNesting,
  validateMachineGraph,
  type SpecEntry,
} from '@llman-sdd/core';

import { REPO_ROOT } from '../../helpers/spawn.ts';

function entryOf(fileName: string, source: string, specId: string): SpecEntry {
  return { fileName, specId, doc: parseCapability(source, fileName) };
}

const STEPS = `      假如 当前处于 <from>
      当 触发 <event>
      那么 流转至 <to>`;

const STATE_STEPS = `      假如 状态 <状态>
      当 读取属性
      那么 子机为 <子机>`;

function cycleRows(a: string, b: string): string {
  return `        | ${a} | go | ${b} |
        | ${b} | back | ${a} |`;
}

function hostChildSpecs(opts?: { childReq?: string; nestRef?: string }): {
  host: string;
  child: string;
} {
  const childReq = opts?.childReq ?? 'r20';
  const nestRef = opts?.nestRef ?? `@req:${childReq}`;
  const host = `# language: zh-CN
# purpose: host
功能: host

  @req:r10
  规则: 宿主流程
    宿主 MUST 嵌套子机。

    @flow
    @transitions
    场景大纲: 主流程
${STEPS}
      例子:
        | from | event | to |
${cycleRows('待审', '完成')}

    @states
    场景大纲: 状态属性
${STATE_STEPS}
      例子:
        | 状态 | 子机 | 网关 |
        | 待审 | ${nestRef} | 是 |
`;
  const child = `# language: zh-CN
# purpose: child
功能: child

  @req:${childReq}
  规则: 子机流程
    子机 MUST 独立流转。

    @transitions
    场景大纲: 审批流
${STEPS}
      例子:
        | from | event | to |
${cycleRows('草稿', '通过')}
`;
  return { host, child };
}

describe('studio flow dialect and nested machines', () => {
  test('A1: @flow extracts graphKind=flow and validateMachineGraph runs F-series', () => {
    const { host, child } = hostChildSpecs();
    const extracted = extractStudioMachines([
      entryOf('llmanspec/specs/host.feature', host, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    const flow = extracted.find((e) => e.machine.capability === 'host')!.machine;
    expect(flow.graphKind).toBe('flow');
    const diags = validateMachineGraph(flow);
    expect(diags.some((d) => d.code.startsWith('F'))).toBe(true);
    expect(diags.some((d) => d.code === 'E4')).toBe(false);
  });

  test('A2: @states extracts subMachineKey/isGateway and resolves cross-capability refs', () => {
    const { host, child } = hostChildSpecs();
    const extracted = extractStudioMachines([
      entryOf('llmanspec/specs/host.feature', host, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    const hostM = extracted.find((e) => e.machine.capability === 'host')!.machine;
    const pending = hostM.states.find((s) => s.name === '待审')!;
    expect(pending.isGateway).toBe(true);
    expect(pending.subMachineKey).toBe('child/r20/审批流');
  });

  test('A3: N1–N5 red and green via validateAllSpecs / validateFlowAndNesting', () => {
    const { host, child } = hostChildSpecs();
    const green = validateAllSpecs([
      entryOf('llmanspec/specs/host.feature', host, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    expect(green.failed).toBe(false);
    expect(green.verdicts.every((v) => v.ok)).toBe(true);

    const dangling = hostChildSpecs({ nestRef: '@req:r999' }).host;
    const n1 = validateFlowAndNesting([entryOf('llmanspec/specs/host.feature', dangling, 'host')]);
    expect(
      n1.some((i) => i.level === 'ERROR' && i.message.includes('dangling nested machine')),
    ).toBe(true);

    const cycleHost = hostChildSpecs({ nestRef: '@req:r20' }).host;
    const cycleChild = `# language: zh-CN
# purpose: child
功能: child

  @req:r20
  规则: 子机流程
    子机 MUST 独立流转。

    @transitions
    场景大纲: 审批流
${STEPS}
      例子:
        | from | event | to |
${cycleRows('草稿', '通过')}

    @states
    场景大纲: 状态属性
${STATE_STEPS}
      例子:
        | 状态 | 子机 |
        | 草稿 | @req:r10 |
`;
    const n2 = validateFlowAndNesting([
      entryOf('llmanspec/specs/host.feature', cycleHost, 'host'),
      entryOf('llmanspec/specs/child.feature', cycleChild, 'child'),
    ]);
    expect(n2.some((i) => i.message.includes('nested machine cycle'))).toBe(true);

    const n3src = host.replace('| 待审 | @req:r20 | 是 |', '| 幽灵 | @req:r20 | 是 |');
    const n3 = validateFlowAndNesting([
      entryOf('llmanspec/specs/host.feature', n3src, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    expect(
      n3.some((i) => i.message.includes('host state') && i.message.includes('does not exist')),
    ).toBe(true);

    const n4src = host.replace(
      '| 待审 | @req:r20 | 是 |',
      '| 待审 | @req:r20 | 是 |\n        | 待审 | @req:r20 | |',
    );
    const n4 = validateFlowAndNesting([
      entryOf('llmanspec/specs/host.feature', n4src, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    expect(n4.some((i) => i.message.includes('mapped more than once'))).toBe(true);

    const n5src = `# language: zh-CN
# purpose: ambi
功能: ambi

  @req:r30
  规则: 多机同名
    同规则多机 MUST 消歧。

    @transitions
    场景大纲: 机甲
${STEPS}
      例子:
        | from | event | to |
${cycleRows('idle', 'done')}

    @transitions
    场景大纲: 机乙
${STEPS}
      例子:
        | from | event | to |
${cycleRows('idle', 'other')}

    @states
    场景大纲: 状态属性
${STATE_STEPS}
      例子:
        | 状态 | 子机 |
        | idle | @req:r20 |
`;
    const n5 = validateFlowAndNesting([
      entryOf('llmanspec/specs/ambi.feature', n5src, 'ambi'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    expect(n5.some((i) => i.message.includes('ambiguous'))).toBe(true);
  });

  test('A4: extract then unchanged writeback is byte-identical for every repo spec', () => {
    const specsDir = join(REPO_ROOT, 'llmanspec', 'specs');
    const files = readdirSync(specsDir).filter((f) => f.endsWith('.feature'));
    expect(files.length).toBeGreaterThanOrEqual(17);
    for (const file of files) {
      const original = readFileSync(join(specsDir, file), 'utf8');
      const specId = file.replace(/\.feature$/u, '');
      const entry = entryOf(`llmanspec/specs/${file}`, original, specId);
      const extracted = extractStudioMachines([entry]);
      let text = original;
      for (const { draft } of extracted) {
        text = renderUpdatedFeatureSource(text, draft);
      }
      expect(text).toBe(original);
    }
  });

  test('A4: rename and nest add/remove writeback then re-extract is semantically equal', () => {
    const { host, child } = hostChildSpecs();
    const entries = [
      entryOf('llmanspec/specs/host.feature', host, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ];
    const extracted = extractStudioMachines(entries);
    const hostDraft = extracted.find((e) => e.machine.capability === 'host')!.draft;
    const cur = cloneMachineIR(hostDraft.current!);
    const pending = cur.states.find((s) => s.name === '待审')!;
    pending.name = '审核中';
    const done = cur.states.find((s) => s.name === '完成')!;
    done.subMachineKey = pending.subMachineKey;
    delete pending.subMachineKey;
    pending.isGateway = true;
    const updated = renderUpdatedFeatureSource(host, {
      ...hostDraft,
      current: cur,
    });
    expect(updated).toContain('审核中');
    expect(updated).toContain('@states');
    const reextracted = extractStudioMachines([
      entryOf('llmanspec/specs/host.feature', updated, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    const again = reextracted.find((e) => e.machine.capability === 'host')!.machine;
    expect(again.states.find((s) => s.name === '审核中')?.isGateway).toBe(true);
    expect(again.states.find((s) => s.name === '完成')?.subMachineKey).toBe('child/r20/审批流');
    expect(again.states.find((s) => s.name === '审核中')?.subMachineKey).toBeUndefined();
  });

  test('A5: @states tables are excluded from decisionTableCount and extractDecisionTables', () => {
    const { host, child } = hostChildSpecs();
    const hostEntry = entryOf('llmanspec/specs/host.feature', host, 'host');
    const childEntry = entryOf('llmanspec/specs/child.feature', child, 'child');
    expect(extractDecisionTables(hostEntry.doc)).toEqual([]);
    const forest = buildForestGraph([hostEntry, childEntry]);
    expect(forest.nodes.find((n) => n.id === 'host')?.decisionTableCount).toBe(0);
    expect(forest.nodes.find((n) => n.id === 'host')?.nestedMachineCount).toBe(1);
    expect(forest.nodes.find((n) => n.id === 'host')?.maxNestingDepth).toBeGreaterThanOrEqual(1);
    expect(forest.edges.filter((e) => e.kind === 'spec-ref').length).toBe(0);
  });

  test('A6: diff/sync see nest link changes; same-signature both stays blocked', () => {
    const { host, child } = hostChildSpecs();
    const extracted = extractStudioMachines([
      entryOf('llmanspec/specs/host.feature', host, 'host'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    const draft = extracted.find((e) => e.machine.capability === 'host')!.draft;
    const ours = cloneMachineIR(draft.current!);
    ours.states.find((s) => s.name === '待审')!.subMachineKey = 'other/r1/alt';
    const theirs = cloneMachineIR(draft.current!);
    theirs.states.find((s) => s.name === '待审')!.subMachineKey = 'third/r2/alt';
    const oursDraft = { ...draft, current: ours };
    const diff = computeMachineDiff(oursDraft);
    expect(diff.nestLinksChanged.length).toBe(1);
    expect(formatSemanticDiff(diff, oursDraft)).toContain('nest:');
    const items = buildSyncItems(oursDraft, theirs);
    const nestItem = items.find((i) => i.kind === 'nest');
    expect(nestItem).toBeDefined();
    expect(nestItem!.defaultPick).toBeNull();
    const blocked = applySyncPicks(
      oursDraft,
      items,
      { [nestItem!.id]: 'both' },
      '2026-11-28T00:00:00.000Z',
    );
    expect(blocked.blocked).toEqual([{ itemId: nestItem!.id, reason: SYNC_BOTH_BLOCKED_REASON }]);
  });

  test('shared submachine across two hosts is allowed; @states is not a transition table', () => {
    const { child } = hostChildSpecs();
    const shared = `# language: zh-CN
# purpose: shared
功能: shared

  @req:r40
  规则: 甲
    甲 MUST 共享子机。

    @transitions
    场景大纲: 甲机
${STEPS}
      例子:
        | from | event | to |
${cycleRows('x', 'y')}

    @states
    场景大纲: 甲属性
${STATE_STEPS}
      例子:
        | 状态 | 子机 |
        | x | @req:r20 |

  @req:r41
  规则: 乙
    乙 MUST 共享子机。

    @transitions
    场景大纲: 乙机
${STEPS}
      例子:
        | from | event | to |
${cycleRows('p', 'q')}

    @states
    场景大纲: 乙属性
${STATE_STEPS}
      例子:
        | 状态 | 子机 |
        | p | @req:r20 |
`;
    const report = validateAllSpecs([
      entryOf('llmanspec/specs/shared.feature', shared, 'shared'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    expect(report.failed).toBe(false);
    const extracted = extractStudioMachines([
      entryOf('llmanspec/specs/shared.feature', shared, 'shared'),
      entryOf('llmanspec/specs/child.feature', child, 'child'),
    ]);
    const keys = extracted
      .filter((e) => e.machine.capability === 'shared')
      .map((e) => e.machine.states.find((s) => s.subMachineKey)?.subMachineKey);
    expect(keys).toEqual(['child/r20/审批流', 'child/r20/审批流']);
  });
});
