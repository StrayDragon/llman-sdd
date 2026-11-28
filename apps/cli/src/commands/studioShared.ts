/**
 * Shared leaf helpers for Studio CLI (`studio.ts`) and Studio MCP (`studioMcp.ts`).
 * One-way dependency: both command modules import from here to avoid cycles.
 */
import {
  listStudioStates,
  readStudioState,
  StudioStateError,
  validateStateId,
  type StudioStateDoc,
  type StudioStateIo,
} from '@llman-sdd/core';

import { CliError, formatNotFound } from '../cli-shared.ts';
import { makeIo } from '../io.ts';

export const EMPTY_DRAFT_NEXT = {
  diff: 'run `llman-sdd studio open` to create one, or `llman-sdd studio validate --specs` to check machines straight from llmanspec/specs/.',
  prompt: 'run `llman-sdd studio open` to create one.',
  apply: 'run `llman-sdd studio open` to create one, then retry with a draft id.',
  revise: 'run `llman-sdd studio open` to create one, then retry with a draft id.',
} as const;

/**
 * Node filesystem adapter for C1 `StudioStateIo` anchored at `instanceRoot`.
 * Writes go through sibling `.tmp.<pid>.<seq>` + atomic `renameSync` (via core `writeStudioState`);
 * read operations never lazily create `.llman-sdd/studio/states/`.
 */
export function makeNodeStudioStateIo(instanceRoot: string): StudioStateIo {
  const io = makeIo(instanceRoot);
  return {
    exists: io.exists,
    readText: io.readText,
    writeText: io.writeText,
    rename: io.rename,
    listDir: io.listDir,
    mkdirp: io.mkdirp,
    remove: io.remove,
    currentPid: io.currentPid,
    now: io.now,
  };
}

/**
 * Resolve an optional `[state-id]` argument:
 * - explicit ID: validated and returned
 * - omitted + 1 state on disk: auto-selected
 * - omitted + 0 states: domain error (exit 1)
 * - omitted + >1 states: domain error listing all IDs (exit 1)
 */
export function resolveStateIdOrThrow(
  io: StudioStateIo,
  stateId?: string,
  next: string = EMPTY_DRAFT_NEXT.diff,
): string {
  if (stateId !== undefined) {
    return validateStateId(stateId);
  }
  const states = listStudioStates(io);
  if (states.length === 0) {
    throw new CliError(`no studio drafts in .llman-sdd/studio/states/.\nNext: ${next}`, 1);
  }
  if (states.length === 1) {
    return states[0]!.id;
  }
  const ids = states.map((s) => s.id).join(', ');
  throw new CliError(`multiple studio drafts found (${ids}); specify <state-id> explicitly`, 1);
}

export function readStudioStateOrThrow(io: StudioStateIo, stateId: string): StudioStateDoc {
  const id = validateStateId(stateId);
  try {
    return readStudioState(io, id);
  } catch (error) {
    if (error instanceof StudioStateError && error.message.startsWith('studio state not found:')) {
      throw new CliError(
        formatNotFound(
          'studio state',
          id,
          listStudioStates(io).map((s) => s.id),
        ),
        1,
      );
    }
    throw error;
  }
}
