/**
 * Single CLI-side IO adapter: one root-relative CliIo object over node:fs
 * that structurally satisfies every core port (FsIo, DiscoveryIo, IndexIo,
 * ChangeFsIo / GraphFsIo / ShowFsIo, HashIo, FreezeIo). Relative paths resolve
 * against root; absolute paths pass through untouched.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { makeSpawnGit, type GitLike } from '@llman-sdd/core';

export interface CliIo {
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, content: string): void;
  rename(from: string, to: string): void;
  listDir(path: string): string[];
  isDirectory(path: string): boolean;
  remove(path: string): void;
  mkdirp(path: string): void;
  processAlive(pid: number): boolean;
  currentPid(): number;
  now(): Date;
  mtimeMs(path: string): number;
  removeDir(path: string): void;
  moveDir(from: string, to: string): void;
}

export function makeIo(root: string): CliIo {
  const full = (p: string): string => (isAbsolute(p) ? p : join(root, p));
  const parentOf = (p: string): string => p.slice(0, p.lastIndexOf('/')) || '.';
  return {
    exists: (p) => existsSync(full(p)),
    readText: (p) => readFileSync(full(p), 'utf8'),
    writeText: (p, content) => {
      mkdirSync(parentOf(full(p)), { recursive: true });
      writeFileSync(full(p), content);
    },
    rename: (from, to) => {
      mkdirSync(parentOf(full(to)), { recursive: true });
      renameSync(full(from), full(to));
    },
    listDir: (p) => readdirSync(full(p)),
    isDirectory: (p) => existsSync(full(p)) && statSync(full(p)).isDirectory(),
    remove: (p) => rmSync(full(p), { force: true }),
    mkdirp: (p) => mkdirSync(full(p), { recursive: true }),
    processAlive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        // EPERM = 进程存在但无权发信号;只有 ESRCH 才能判定死亡。
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
      }
    },
    currentPid: () => process.pid,
    now: () => new Date(),
    mtimeMs: (p) => statSync(full(p)).mtimeMs,
    removeDir: (p) => rmSync(full(p), { recursive: true, force: true }),
    moveDir: (from, to) => renameSync(full(from), full(to)),
  };
}

export function makeCliGit(root: string): GitLike {
  return makeSpawnGit(root);
}
