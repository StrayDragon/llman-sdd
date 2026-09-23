/**
 * Test-side InitIo/FsIo/ShowFsIo/ChangeFsIo adapter over node:fs, rooted at a
 * temp project directory. Mirrors apps/cli/src/io.ts's CliIo resolution
 * (root-relative paths; absolute pass through) without importing the CLI
 * entrypoint.
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
import { dirname, isAbsolute, join } from 'node:path';

export function makeNodeIo(root: string) {
  const full = (p: string): string => (isAbsolute(p) ? p : join(root, p));
  return {
    exists: (p: string): boolean => existsSync(full(p)),
    readText: (p: string): string => readFileSync(full(p), 'utf8'),
    writeText: (p: string, content: string): void => {
      const target = full(p);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    },
    mkdirp: (p: string): void => {
      mkdirSync(full(p), { recursive: true });
    },
    listDir: (p: string): string[] => readdirSync(full(p)),
    isDirectory: (p: string): boolean => statSync(full(p)).isDirectory(),
    mtimeMs: (p: string): number => statSync(full(p)).mtimeMs,
    removeDir: (p: string): void => rmSync(full(p), { recursive: true, force: true }),
    rename: (from: string, to: string): void => {
      mkdirSync(dirname(full(to)), { recursive: true });
      renameSync(full(from), full(to));
    },
  };
}
