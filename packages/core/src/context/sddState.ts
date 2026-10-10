/**
 * Scaffold-state record (version-awareness capability): init stamps the CLI
 * version that rendered the project so later runs can detect drift. All paths
 * ROOT-RELATIVE through the injected IO; corrupt/missing state is silent-OK
 * (the notice is best-effort, never load-bearing).
 */

import { CONTEXT_DIR_REL } from './indexStore.ts';

export const SDD_STATE_REL = `${CONTEXT_DIR_REL}/sdd-state.json`;

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

/** Persist the scaffold version (called from runInit after config resolution). */
export function writeSddState(io: StateIo, version: string): void {
  io.mkdirp(CONTEXT_DIR_REL);
  const state: SddState = { cli_version: version };
  io.writeText(SDD_STATE_REL, `${JSON.stringify(state, null, 2)}\n`);
}

/** Read the recorded version; null when absent/corrupt (silent-OK contract). */
export function readSddState(io: Pick<StateIo, 'exists' | 'readText'>): SddState | null {
  if (!io.exists(SDD_STATE_REL)) return null;
  try {
    const parsed: unknown = JSON.parse(io.readText(SDD_STATE_REL));
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

const dot = (v: string): number => Math.trunc(Number(v)) || 0;

/** Numeric semver-major.minor.patch compare; non-numeric segments compare 0. */
export function semverLt(a: string, b: string): boolean {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < 3; i++) {
    const ai = dot(pa[i] ?? '0');
    const bi = dot(pb[i] ?? '0');
    if (ai !== bi) return ai < bi;
  }
  return false;
}
