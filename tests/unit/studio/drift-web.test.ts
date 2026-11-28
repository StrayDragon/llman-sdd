import { describe, expect, test } from 'bun:test';

import {
  acceptRevisionProposal,
  applyDriftProposalsToStateDoc,
  buildDemoStudioWebDrafts,
  createStudioStateDoc,
  validateMachineGraph,
} from '@llman-sdd/core';

import {
  buildTruthWinsPrompt,
  computeDriftCalibrationOverlay,
  countShadowEdgesInProposals,
  getPendingDriftProposals,
} from '../../../apps/studio/src/drift/reconcileOverlay.ts';

describe('studio web 逻辑漂移校准 overlay & dual-exit adjudication (r151)', () => {
  test('projects dashed green canvas overlay, Truth-Wins Prompt, and Ratify-New-Intent acceptance', () => {
    const [l1] = buildDemoStudioWebDrafts();
    const machineKey = l1!.current!.machineKey;
    const baseDoc = createStudioStateDoc({
      id: 'drift-web-1',
      title: 'Drift Web Test',
      createdAt: '2026-11-27T00:00:00Z',
      drafts: [l1!],
    });

    const { doc, addedProposalIds } = applyDriftProposalsToStateDoc(
      baseDoc,
      [
        {
          machineKey,
          from: '画布直编与草稿态',
          event: '紧急直写热修',
          to: '旁路热修态',
          count: 2,
          sampleLines: [12, 19],
        },
      ],
      '2026-11-27T00:01:00Z',
    );
    expect(addedProposalIds.length).toBe(1);

    const pending = getPendingDriftProposals(doc.revisions, machineKey);
    expect(pending.length).toBe(1);
    expect(countShadowEdgesInProposals(pending)).toBe(1);

    const overlay = computeDriftCalibrationOverlay(doc.machines[machineKey]!.current!, pending);
    expect(overlay).not.toBeNull();
    expect(overlay!.addedStates.map((s) => s.name)).toEqual(['旁路热修态']);
    expect(overlay!.addedEdges.length).toBe(1);
    expect(overlay!.addedEdges[0]!.event).toBe('紧急直写热修');

    // Exit 1: Truth Wins pre-edit prompt (zero blind copy)
    const prompt = buildTruthWinsPrompt({
      repo: 'llman-sdd',
      branch: 'main',
      wsKey: 'llman-sdd@main@root',
      stateId: doc.id,
      machineKey,
      sourceFile: doc.machines[machineKey]!.sourceFile,
      proposals: pending,
    });
    expect(prompt).toContain('逻辑漂移校准 · 真理胜出');
    expect(prompt).toContain(`machine:${machineKey}`);
    expect(prompt).toContain('紧急直写热修');
    expect(prompt).toContain('--fail-on-shadow');

    // Exit 2: Ratify New Intent merges into draft, records actor='agent' worldline entry, runs linter
    const accepted = acceptRevisionProposal(doc, pending[0]!.id, '2026-11-27T00:02:00Z');
    expect(accepted.revisions[0]!.status).toBe('accepted');
    const tl = accepted.timelines[machineKey]!;
    expect(tl.entries.at(-1)?.actor).toBe('agent');
    const updatedMachine = accepted.machines[machineKey]!.current!;
    expect(updatedMachine.states.some((s) => s.name === '旁路热修态')).toBe(true);
    expect(validateMachineGraph(updatedMachine)).toBeArray();
  });
});
