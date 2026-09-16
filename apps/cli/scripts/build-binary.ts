// Build the CLI into a single self-contained binary via Bun.compile.
// Version SSOT is the git tag (vX.Y.Z); falls back to the package version for
// local/dev builds. The value is injected as process.env.LLMAN_SDD_VERSION at
// build time (see apps/cli/src/main.ts).
//
// Release-matrix hooks (used by .github/workflows/release.yml):
//   BIN_NAME           — output filename (default llman-sdd)
//   BUN_COMPILE_TARGET — bun cross-compile target, e.g. bun-linux-arm64
//                        (default: host target)
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const exactTag = Bun.spawnSync(['git', 'describe', '--tags', '--exact-match', '--abbrev=0'], {
  stdout: 'pipe',
  stderr: 'pipe',
});
const version = exactTag.exitCode === 0 ? exactTag.stdout.toString().trim() : pkg.version;

const binName = process.env.BIN_NAME ?? 'llman-sdd';
const compileTarget = process.env.BUN_COMPILE_TARGET as
  | (NonNullable<Parameters<typeof Bun.build>[0]['compile']> extends infer C
      ? C extends { target?: infer T }
        ? T
        : never
      : never)
  | undefined;

const outfile = new URL(`../dist/${binName}`, import.meta.url).pathname;
const result = await Bun.build({
  entrypoints: [new URL('../src/main.ts', import.meta.url).pathname],
  target: 'bun',
  define: {
    'process.env.LLMAN_SDD_VERSION': JSON.stringify(version),
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
console.log(`built ${outfile} (version ${version})`);
