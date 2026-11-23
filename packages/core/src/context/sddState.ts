/**
 * Scaffold-state record (version-awareness): init stamps the CLI version that
 * rendered the project so later runs can detect drift. The stamp lives at
 * `llmanspec/.sdd-state.json`. Reads fall back to the previous
 * `llmanspec/.context/sdd-state.json` and never delete it. Writes only the
 * new path. Corrupt or missing state is silent-OK.
 */

export const SDD_STATE_REL = 'llmanspec/.sdd-state.json';
export const LEGACY_SDD_STATE_REL = 'llmanspec/.context/sdd-state.json';

export interface SddState {
  /** llman-sdd version that last rendered this project (init / --update). */
  cli_version: string;
}

type StateIo = {
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, content: string): void;
  mkdirp(path: string): void;
};

function parseState(raw: string): SddState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as SddState).cli_version === 'string'
    ) {
      return parsed as SddState;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the scaffold version. Does not touch the legacy path. */
export function writeSddState(io: StateIo, version: string): void {
  io.mkdirp('llmanspec');
  const state: SddState = { cli_version: version };
  io.writeText(SDD_STATE_REL, `${JSON.stringify(state, null, 2)}\n`);
}

/** Read the recorded version: new path, then the legacy path. */
export function readSddState(io: Pick<StateIo, 'exists' | 'readText'>): SddState | null {
  if (io.exists(SDD_STATE_REL)) return parseState(io.readText(SDD_STATE_REL));
  if (io.exists(LEGACY_SDD_STATE_REL)) return parseState(io.readText(LEGACY_SDD_STATE_REL));
  return null;
}

export { semverLt } from '../util/semver.ts';
