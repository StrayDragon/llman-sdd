/**
 * Shared leaf helpers for Studio CLI (`studio.ts`) and Studio MCP (`studioMcp.ts`).
 * One-way dependency: both command modules import from here to avoid cycles.
 */
import { listStudioStates, validateStateId, type StudioStateIo } from '@llman-sdd/core';

import { CliError } from '../cli-shared.ts';
import { makeIo } from '../io.ts';

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
export function resolveStateIdOrThrow(io: StudioStateIo, stateId?: string): string {
  if (stateId !== undefined) {
    return validateStateId(stateId);
  }
  const states = listStudioStates(io);
  if (states.length === 0) {
    throw new CliError(
      'no studio drafts found in .llman-sdd/studio/states/; create a draft or launch Studio first',
      1,
    );
  }
  if (states.length === 1) {
    return states[0]!.id;
  }
  const ids = states.map((s) => s.id).join(', ');
  throw new CliError(`multiple studio drafts found (${ids}); specify <state-id> explicitly`, 1);
}
