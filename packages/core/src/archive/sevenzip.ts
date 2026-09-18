import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * 7z adapter (review-freeze capability, r24/r25): 7z-wasm (Emscripten) with
 * NODEFS mounts — self-contained, no system 7z dependency. One module
 * instance per operation; extraction target must be a fresh directory
 * (WASM 7z refuses existing -o dirs). Spike-proven on Bun: compress / list /
 * extract keep directory structure.
 *
 * Compiled single-file binaries have no on-disk 7zz.wasm (Emscripten would
 * probe $bunfs and abort), so build-binary.ts additionally injects the wasm
 * base64 via the literal define `process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64`
 * (define only rewrites literal member access — do not route through a
 * variable). Unset in source/npm/Node runs → glue loads the .wasm from disk
 * as before.
 */
import SevenZip from '7z-wasm';

export interface SevenZipPort {
  /** Add `entries` (paths relative to `baseDir`) into `archivePath`. */
  add(archivePath: string, baseDir: string, entries: string[]): Promise<void>;
  /** List entry paths stored in the archive. */
  listEntries(archivePath: string): Promise<string[]>;
  /** Extract the whole archive into `destDir` (created fresh, must not exist). */
  extractAll(archivePath: string, destDir: string): Promise<void>;
}

export class SevenZipError extends Error {}

interface EmscriptenModule {
  FS: {
    mkdir(path: string): void;
    mount(type: unknown, opts: { root: string }, mountpoint: string): void;
    chdir(path: string): void;
  };
  NODEFS: unknown;
  callMain(args: string[]): number;
}

type ModuleFactory = (opts: {
  noInitialRun: boolean;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  wasmBinary?: Uint8Array;
}) => Promise<EmscriptenModule>;

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d] as const;

/** Decode a base64 wasm blob; undefined when absent or not a WASM binary.
 * Base64 decoding itself never throws, so the magic bytes are the guard. */
export function resolveEmbeddedWasmB64(value: unknown): Uint8Array | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 4 || WASM_MAGIC.some((b, i) => bytes[i] !== b)) return undefined;
  return new Uint8Array(bytes);
}

/** Read the build-injected wasm; undefined when absent or malformed. */
export function embeddedWasmBinary(): Uint8Array | undefined {
  return resolveEmbeddedWasmB64(process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64);
}

async function initModule(
  print?: (text: string) => void,
  wasmBinary?: Uint8Array,
): Promise<EmscriptenModule> {
  const sink = (text: string): void => {
    if (print) print(text);
  };
  const factory = SevenZip as unknown as ModuleFactory;
  return factory({ noInitialRun: true, print: sink, printErr: sink, wasmBinary });
}

function mount(mod: EmscriptenModule, seq: number, hostDir: string): string {
  const mountpoint = `/mnt${seq}`;
  mod.FS.mkdir(mountpoint);
  mod.FS.mount(mod.NODEFS, { root: hostDir }, mountpoint);
  return mountpoint;
}

/** 7z `l` listing: header/footer dashed rules around fixed-ish columns; our
 * entry names are space-free, so the name is column 6+. */
function parseListNames(lines: string[]): string[] {
  const names: string[] = [];
  let inTable = false;
  let rulesSeen = 0;
  for (const line of lines) {
    if (/^-+/u.test(line)) {
      rulesSeen += 1;
      if (rulesSeen === 2) inTable = true;
      if (rulesSeen === 3) break;
      continue;
    }
    if (inTable) {
      const parts = line.trim().split(/\s+/u);
      if (parts.length >= 6) {
        const attr = parts[2] ?? '';
        const name = parts.slice(5).join(' ');
        if (name !== '' && !attr.includes('D')) names.push(name);
      }
    }
  }
  return names;
}

export async function makeWasmSevenZip(): Promise<SevenZipPort> {
  const wasmBinary = embeddedWasmBinary();
  return {
    async add(archivePath: string, baseDir: string, entries: string[]): Promise<void> {
      const mod = await initModule(undefined, wasmBinary);
      const archMount = mount(mod, 1, join(archivePath, '..'));
      const baseMount = mount(mod, 2, baseDir);
      mod.FS.chdir(baseMount);
      const rc = mod.callMain(['a', `${archMount}/${basename(archivePath)}`, ...entries]);
      if (rc !== 0) throw new SevenZipError(`7z add failed (rc=${rc})`);
    },

    async listEntries(archivePath: string): Promise<string[]> {
      const lines: string[] = [];
      const mod = await initModule((text) => lines.push(text), wasmBinary);
      const archMount = mount(mod, 1, join(archivePath, '..'));
      const rc = mod.callMain(['l', `${archMount}/${basename(archivePath)}`]);
      if (rc !== 0) throw new SevenZipError(`7z list failed (rc=${rc})`);
      return parseListNames(lines);
    },

    async extractAll(archivePath: string, destDir: string): Promise<void> {
      const mod = await initModule(undefined, wasmBinary);
      const archMount = mount(mod, 1, join(archivePath, '..'));
      mkdirSync(destDir, { recursive: true });
      const destMount = mount(mod, 2, destDir);
      mod.FS.chdir(destMount);
      const rc = mod.callMain(['x', `${archMount}/${basename(archivePath)}`, '-y']);
      if (rc !== 0) throw new SevenZipError(`7z extract failed (rc=${rc})`);
    },
  };
}
