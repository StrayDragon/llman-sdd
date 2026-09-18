// Build the CLI into a single self-contained binary via Bun.compile.
// Version SSOT is the git tag (vX.Y.Z); falls back to the package version for
// local/dev builds. The value (leading `v` stripped) is injected as
// process.env.LLMAN_SDD_VERSION at build time (see apps/cli/src/main.ts), so
// `--version` and init-rendered llman_version match the npm package version.
//
// Templates are embedded the same way: Bun <= 1.4.x offers no embedding that
// survives our Node >= 24 dual-runtime constraint (`with { type: "text" }`
// works on 1.4.2 but Node cannot load it; assets/?raw/?asset never land in
// the bundle), so packages/core/templates is collected into a root-relative
// path→content table injected as LLMAN_SDD_EMBEDDED_TEMPLATES. 7zz.wasm is
// injected as base64 (LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64) — Emscripten otherwise
// probes $bunfs for the file and aborts. Compiled runs resolve through these
// tables; source/npm/Node runs keep using the real filesystem
// (see packages/core/src/templates/embedded.ts and archive/sevenzip.ts).
//
// Release-matrix hooks (used by .github/workflows/release.yml):
//   BIN_NAME           — output filename (default llman-sdd)
//   BUN_COMPILE_TARGET — bun cross-compile target, e.g. bun-linux-arm64
//                        (default: host target)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// fileURLToPath is required for Windows runners: URL.pathname yields "/D:/..."
// which Bun.build cannot open as a directory.
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const exactTag = Bun.spawnSync(['git', 'describe', '--tags', '--exact-match', '--abbrev=0'], {
  stdout: 'pipe',
  stderr: 'pipe',
});
const version =
  exactTag.exitCode === 0 ? exactTag.stdout.toString().trim().replace(/^v/u, '') : pkg.version;

const binName = process.env.BIN_NAME ?? 'llman-sdd';
const compileTarget = process.env.BUN_COMPILE_TARGET as
  | (NonNullable<Parameters<typeof Bun.build>[0]['compile']> extends infer C
      ? C extends { target?: infer T }
        ? T
        : never
      : never)
  | undefined;

const outfile = fileURLToPath(new URL(`../dist/${binName}`, import.meta.url));

/** Collect every file under a directory into posix relative-path keys. */
function collectTemplates(dir: string, prefix: string, out: Record<string, string>): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix === '' ? name : `${prefix}/${name}`;
    if (statSync(full).isDirectory()) collectTemplates(full, rel, out);
    else out[rel] = readFileSync(full, 'utf8');
  }
}
const templatesRoot = fileURLToPath(new URL('../../../packages/core/templates', import.meta.url));
const templates: Record<string, string> = {};
collectTemplates(templatesRoot, '', templates);
if (Object.keys(templates).length === 0) {
  console.error(`warning: no templates found to embed under ${templatesRoot}`);
}

/** Locate 7zz.wasm through the package resolution the runtime import uses. */
function resolveSevenZipWasm(): string {
  const coreDir = fileURLToPath(new URL('../../../packages/core', import.meta.url));
  return Bun.resolveSync('7z-wasm/7zz.wasm', coreDir);
}
let wasmB64 = '';
try {
  wasmB64 = readFileSync(resolveSevenZipWasm()).toString('base64');
} catch (error) {
  console.error(
    `warning: could not embed 7zz.wasm (${(error as Error).message}) — archive freeze/thaw will abort at runtime`,
  );
}

const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))],
  target: 'bun',
  define: {
    'process.env.LLMAN_SDD_VERSION': JSON.stringify(version),
    'process.env.LLMAN_SDD_EMBEDDED_TEMPLATES': JSON.stringify(templates),
    ...(wasmB64 !== ''
      ? { 'process.env.LLMAN_SDD_EMBEDDED_7ZZ_WASM_B64': JSON.stringify(wasmB64) }
      : {}),
  },
  compile: {
    outfile,
    ...(compileTarget ? { target: compileTarget } : {}),
  },
});

if (!result.success) {
  console.error('build failed:', result.logs);
  process.exit(1);
}
console.log(
  `built ${outfile} (version ${version}, ${Object.keys(templates).length} templates embedded` +
    `${wasmB64 !== '' ? ', 7zz.wasm embedded' : ''})`,
);
