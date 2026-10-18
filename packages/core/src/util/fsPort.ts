/**
 * T26 canonical filesystem port: every module declares the narrow `Pick` it
 * consumes, so the structural surface is written once and the per-module
 * shapes cannot drift. The root interface lists the full observed surface
 * (superset union of all past local `*Io` interfaces; no node:fs, no clock).
 */
export interface FsPort {
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, content: string): void;
  rename(from: string, to: string): void;
  listDir(path: string): string[];
  isDirectory(path: string): boolean;
  remove(path: string): void;
  mkdirp(path: string): void;
  removeDir(path: string): void;
  moveDir(from: string, to: string): void;
  /** Process liveness for the rebuild lock (injected, never polled env). */
  processAlive(pid: number): boolean;
  currentPid(): number;
  /** Wall clock, injected (B17: core never calls new Date()). */
  now(): Date;
  mtimeMs(path: string): number;
}
