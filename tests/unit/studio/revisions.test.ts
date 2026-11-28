import { describe, expect, test } from 'bun:test';

import {
  StudioRevisionError,
  acceptRevisionProposal,
  addStudioComment,
  buildDemoReimbursementDraft,
  cloneMachineIR,
  createStudioStateDoc,
  previewRevisionProposal,
  proposeRevision,
  rejectRevisionProposal,
  replyStudioComment,
  resolveStudioComment,
} from '@llman-sdd/core';

function seedDoc() {
  const draft = buildDemoReimbursementDraft();
  const modifyDraft = {
    ...draft,
    mode: 'modify' as const,
    baseline: cloneMachineIR(draft.current!),
  };
  return {
    key: modifyDraft.current!.machineKey,
    doc: createStudioStateDoc({
      id: 'rev-session',
      title: 'Revision Test',
      createdAt: '2026-11-26T10:00:00Z',
      drafts: [modifyDraft],
    }),
  };
}

describe('studio/revisions (r131)', () => {
  test('supports anchored comment creation, threaded reply, and resolution', () => {
    const { key, doc } = seedDoc();
    const withComment = addStudioComment(doc, {
      anchor: { kind: 'state', machineKey: key, stateUid: 's2' },
      author: 'human',
      body: '是否需要区分直属主管和财务复核？',
      createdAt: '2026-11-26T10:01:00Z',
    });
    expect(withComment.comments).toHaveLength(1);
    expect(withComment.comments[0]?.status).toBe('open');

    const replied = replyStudioComment(withComment, 'c1', {
      author: 'agent',
      body: '已起草修订建议 rev1，补充财务复核分支。',
      createdAt: '2026-11-26T10:02:00Z',
      resolve: true,
    });
    expect(replied.comments).toHaveLength(2);
    expect(replied.comments[0]?.status).toBe('resolved');
    expect(replied.comments[1]?.replyTo).toBe('c1');

    const resolvedReply = resolveStudioComment(replied, 'c2', '2026-11-26T10:03:00Z');
    expect(resolvedReply.comments[1]?.status).toBe('resolved');
  });

  test('proposes, previews without mutating human draft, and atomically accepts rename_state + new transition', () => {
    const { key, doc } = seedDoc();
    const beforeSnapshot = JSON.stringify(doc.machines[key]);

    const proposed = proposeRevision(doc, {
      machineKey: key,
      source: 'agent',
      rationale: '将待审批改名为待主管审批，并补齐紧急特批分支',
      createdAt: '2026-11-26T10:05:00Z',
      ops: [
        { op: 'rename_state', from: '待审批', to: '待主管审批' },
        {
          op: 'add_transition',
          from: '待主管审批',
          event: '紧急特批',
          guard: 'VP授权',
          to: '已通过',
        },
      ],
    });

    // Human draft must remain untouched while proposal is pending
    expect(JSON.stringify(proposed.machines[key])).toBe(beforeSnapshot);
    const rev = proposed.revisions[0]!;
    expect(rev.status).toBe('pending');

    // Preview must compute diff & diagnostics without mutating draft
    const preview = previewRevisionProposal(proposed.machines[key]!, rev);
    expect(preview.diffFromCurrent.statesRenamed).toEqual([
      { uid: 's2', from: '待审批', to: '待主管审批' },
    ]);
    expect(preview.diffFromCurrent.transitionsRemoved).toEqual([]);
    expect(preview.diffFromCurrent.transitionsAdded).toHaveLength(1);
    expect(preview.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(JSON.stringify(proposed.machines[key])).toBe(beforeSnapshot);

    // Explicit acceptance atomically applies ops and appends timeline checkpoint
    const accepted = acceptRevisionProposal(proposed, rev.id, '2026-11-26T10:06:00Z');
    expect(accepted.revisions[0]?.status).toBe('accepted');
    const cur = accepted.machines[key]!.current!;
    expect(cur.states.find((s) => s.uid === 's2')?.name).toBe('待主管审批');
    expect(cur.transitions.some((t) => t.event === '紧急特批' && t.guard === 'VP授权')).toBe(true);
    expect(accepted.timelines[key]?.entries).toHaveLength(2);
    expect(accepted.timelines[key]?.headIdx).toBe(1);

    // Re-accepting an accepted proposal must throw
    expect(() => acceptRevisionProposal(accepted, rev.id, '2026-11-26T10:07:00Z')).toThrow(
      StudioRevisionError,
    );
  });

  test('acceptRevisionProposal preserves subMachineKey across rename_state', () => {
    const { key, doc } = seedDoc();
    doc.machines[key]!.current!.states[1]!.subMachineKey = 'child/r1/sub';
    const proposed = proposeRevision(doc, {
      machineKey: key,
      rationale: '改名',
      createdAt: '2026-11-26T10:20:00Z',
      ops: [{ op: 'rename_state', from: '待审批', to: '待主管审批' }],
    });
    const accepted = acceptRevisionProposal(
      proposed,
      proposed.revisions[0]!.id,
      '2026-11-26T10:21:00Z',
    );
    const renamed = accepted.machines[key]!.current!.states.find((s) => s.name === '待主管审批');
    expect(renamed?.subMachineKey).toBe('child/r1/sub');
  });

  test('supports rejecting pending revisions and update/remove transition ops', () => {
    const { key, doc } = seedDoc();
    const withRev = proposeRevision(doc, {
      machineKey: key,
      rationale: '调整驳回文案',
      createdAt: '2026-11-26T10:10:00Z',
      ops: [
        {
          op: 'update_transition',
          match: { from: '待审批', event: '驳回', to: '已驳回' },
          next: { event: '退回修改' },
        },
        { op: 'add_state', name: '待归档' },
        { op: 'remove_state', stateName: '待归档' },
      ],
    });
    const preview = previewRevisionProposal(withRev.machines[key]!, withRev.revisions[0]!);
    expect(preview.machine.transitions.some((t) => t.event === '退回修改')).toBe(true);

    const rejected = rejectRevisionProposal(withRev, 'rev1', '2026-11-26T10:11:00Z');
    expect(rejected.revisions[0]?.status).toBe('rejected');
    expect(rejected.machines[key]?.current?.transitions.some((t) => t.event === '驳回')).toBe(true);
  });
});
