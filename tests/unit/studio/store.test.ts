import { describe, expect, test } from 'bun:test';

import {
  STUDIO_STATES_REL,
  StudioStateError,
  buildDemoStudioDrafts,
  cloneMachineIR,
  computeMachineDiff,
  createStudioStateDoc,
  deleteStudioState,
  hasBlockingDiagnostics,
  listStudioStates,
  previewTimelineEntry,
  readStudioState,
  recordTimelineCommit,
  redoTimeline,
  rollbackTimeline,
  undoTimeline,
  validateMachineGraph,
  validateStateId,
  writeStudioState,
  type StudioStateIo,
} from '@llman-sdd/core';

interface MemoryFsTrace {
  io: StudioStateIo;
  files: Map<string, string>;
  dirs: Set<string>;
  renames: Array<{ from: string; to: string }>;
}

function makeMemoryStudioIo(): MemoryFsTrace {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const renames: Array<{ from: string; to: string }> = [];

  const io: StudioStateIo = {
    exists: (p) => files.has(p) || dirs.has(p),
    readText: (p) => {
      const content = files.get(p);
      if (content === undefined) throw new Error(`ENOENT: ${p}`);
      return content;
    },
    writeText: (p, content) => {
      files.set(p, content);
    },
    rename: (from, to) => {
      const content = files.get(from);
      if (content === undefined) throw new Error(`ENOENT rename: ${from}`);
      files.delete(from);
      files.set(to, content);
      renames.push({ from, to });
    },
    listDir: (dir) => {
      const prefix = dir.endsWith('/') ? dir : `${dir}/`;
      const names: string[] = [];
      for (const k of files.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          if (!rest.includes('/')) names.push(rest);
        }
      }
      return names;
    },
    mkdirp: (dir) => {
      dirs.add(dir);
    },
    remove: (p) => {
      files.delete(p);
    },
    currentPid: () => 4242,
    now: () => new Date('2026-11-26T12:00:00Z'),
  };

  return { io, files, dirs, renames };
}

describe('studio/store & demos (r132)', () => {
  test('built-in demo state machines pass validateMachineGraph with zero blocking errors', () => {
    const demos = buildDemoStudioDrafts();
    expect(demos).toHaveLength(2);
    for (const demo of demos) {
      expect(demo.current).not.toBeNull();
      const diags = validateMachineGraph(demo.current!);
      expect(hasBlockingDiagnostics(diags)).toBe(false);
    }
  });

  test('rejects path-traversal or malformed state ids', () => {
    expect(() => validateStateId('../evil')).toThrow(StudioStateError);
    expect(() => validateStateId('nested/id')).toThrow(StudioStateError);
    expect(() => validateStateId('UPPER')).toThrow(StudioStateError);
    expect(validateStateId('reimbursement-flow-1')).toBe('reimbursement-flow-1');
  });

  test('atomically writes via tmp+rename, reads, lists, and deletes without touching real disk', () => {
    const mem = makeMemoryStudioIo();
    expect(listStudioStates(mem.io)).toEqual([]);
    expect(mem.dirs.has(STUDIO_STATES_REL)).toBe(false);

    const demos = buildDemoStudioDrafts();
    const doc = createStudioStateDoc({
      id: 'reimbursement-draft',
      title: '报销审批草稿',
      createdAt: '2026-11-26T12:00:00Z',
      drafts: demos,
    });

    const relPath = writeStudioState(mem.io, doc);
    expect(relPath).toBe(`${STUDIO_STATES_REL}/reimbursement-draft.json`);
    expect(mem.dirs.has(STUDIO_STATES_REL)).toBe(true);
    expect(mem.renames).toHaveLength(1);
    expect(mem.renames[0]?.from).toContain('.reimbursement-draft.tmp.4242.');
    expect(mem.renames[0]?.to).toBe(relPath);

    const loaded = readStudioState(mem.io, 'reimbursement-draft');
    expect(loaded).toEqual(doc);

    const summaries = listStudioStates(mem.io);
    expect(summaries).toEqual([
      {
        id: 'reimbursement-draft',
        title: '报销审批草稿',
        machineCount: 2,
        updatedAt: '2026-11-26T12:00:00Z',
      },
    ]);

    expect(deleteStudioState(mem.io, 'reimbursement-draft')).toBe(true);
    expect(deleteStudioState(mem.io, 'reimbursement-draft')).toBe(false);
    expect(listStudioStates(mem.io)).toEqual([]);
  });

  test('supports Git-like linear timeline commit, read-only preview, undo, redo, and rollback to BASE', () => {
    const baseDemo = buildDemoStudioDrafts()[0]!;
    const modifyDraft = {
      ...baseDemo,
      mode: 'modify' as const,
      baseline: cloneMachineIR(baseDemo.current!),
    };
    const key = modifyDraft.current!.machineKey;

    let doc = createStudioStateDoc({
      id: 'timeline-test',
      title: 'Timeline Test',
      createdAt: '2026-11-26T12:00:00Z',
      drafts: [modifyDraft],
    });

    // Commit #1: rename state s1
    const step1 = cloneMachineIR(doc.machines[key]!.current!);
    step1.states[0]!.name = '填写中';
    doc = recordTimelineCommit(doc, key, step1, {
      label: '重命名 草稿 -> 填写中',
      createdAt: '2026-11-26T12:01:00Z',
    });

    // Commit #2: rename state s2
    const step2 = cloneMachineIR(doc.machines[key]!.current!);
    step2.states[1]!.name = '主管审批';
    doc = recordTimelineCommit(doc, key, step2, {
      label: '重命名 待审批 -> 主管审批',
      createdAt: '2026-11-26T12:02:00Z',
    });

    expect(doc.timelines[key]?.entries).toHaveLength(3);
    expect(doc.timelines[key]?.headIdx).toBe(2);

    // Read-only preview at #1 does not move headIdx
    const preview1 = previewTimelineEntry(doc, key, 1);
    expect(preview1.current?.states[0]?.name).toBe('填写中');
    expect(preview1.current?.states[1]?.name).toBe('待审批');
    expect(doc.timelines[key]?.headIdx).toBe(2);

    // Undo -> #1, then Redo -> #2
    doc = undoTimeline(doc, key, '2026-11-26T12:03:00Z');
    expect(doc.timelines[key]?.headIdx).toBe(1);
    expect(doc.machines[key]?.current?.states[1]?.name).toBe('待审批');

    doc = redoTimeline(doc, key, '2026-11-26T12:04:00Z');
    expect(doc.timelines[key]?.headIdx).toBe(2);
    expect(doc.machines[key]?.current?.states[1]?.name).toBe('主管审批');

    // Rollback to checkpoint #1 appends an auditable rollback commit
    const rolled1 = rollbackTimeline(doc, key, 1, '2026-11-26T12:05:00Z');
    expect(rolled1.timelines[key]?.entries).toHaveLength(4);
    expect(rolled1.machines[key]?.current?.states[1]?.name).toBe('待审批');

    // Rollback to BASE (index 0) restores exact baseline with zero net diff
    const rolledBase = rollbackTimeline(rolled1, key, 0, '2026-11-26T12:06:00Z');
    expect(rolledBase.timelines[key]?.headIdx).toBe(0);
    expect(computeMachineDiff(rolledBase.machines[key]!).hasChanges).toBe(false);
  });
});
