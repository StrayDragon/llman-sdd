/**
 * Fold SSE / draft facts into collapsed activity items (studio-web r166).
 */
import type { StudioComment, StudioRevisionProposal, StudioSseEvent } from '@llman-sdd/core/studio';

import { SYNC_COPY, agentCommentLabel } from './copy.ts';

export type ActivityKind = 'peer-save' | 'agent-comment' | 'drift';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  label: string;
  targetKind?: 'comment' | 'revision' | 'workspace';
  targetId?: string;
}

export function foldActivityItems(input: {
  events: readonly StudioSseEvent[];
  selfClientId: string;
  activeWsKey: string;
  comments: readonly StudioComment[];
  revisions: readonly StudioRevisionProposal[];
}): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const ev of input.events) {
    if (ev.type === 'state-updated') {
      if (ev.originClientId === input.selfClientId) continue;
      items.push({
        id: `save:${ev.wsKey}:${String(ev.revision)}`,
        kind: 'peer-save',
        label: SYNC_COPY.peerSaved,
        targetKind: 'workspace',
        targetId: ev.wsKey,
      });
    }
  }
  for (const c of input.comments) {
    if (c.status !== 'open' || c.author !== 'agent') continue;
    const short =
      c.anchor.kind === 'state'
        ? c.anchor.stateUid
        : c.anchor.kind === 'edge'
          ? c.anchor.edgeUid
          : c.anchor.kind === 'macro-edge'
            ? c.anchor.edgeId
            : c.anchor.kind === 'machine'
              ? c.anchor.machineKey
              : c.anchor.kind === 'forest'
                ? c.anchor.capability
                : c.anchor.capability;
    items.push({
      id: `comment:${c.id}`,
      kind: 'agent-comment',
      label: agentCommentLabel(short),
      targetKind: 'comment',
      targetId: c.id,
    });
  }
  for (const r of input.revisions) {
    if (r.status !== 'pending' || r.source !== 'drift-trace') continue;
    items.push({
      id: `drift:${r.id}`,
      kind: 'drift',
      label: SYNC_COPY.driftPending,
      targetKind: 'revision',
      targetId: r.id,
    });
  }
  return items;
}
