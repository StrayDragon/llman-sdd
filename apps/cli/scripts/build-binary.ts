// Build the CLI into a single self-contained binary via Bun.compile.
// Version SSOT is the git tag (vX.Y.Z); falls back to the package version for
// local/dev builds. The value is injected as process.env.LLMAN_SDD_VERSION at
// build time (see apps/cli/src/main.ts).
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const exactTag = Bun.spawnSync(['git', 'describe', '--tags', '--exact-match', '--abbrev=0'], {
  stdout: 'pipe',
  stderr: 'pipe',
});
const version = exactTag.exitCode === 0 ? exactTag.stdout.toString().trim() : pkg.version;

const outfile = new URL('../dist/llman-sdd', import.meta.url).pathname;
const result = await Bun.build({
  entrypoints: [new URL('../src/main.ts', import.meta.url).pathname],
  target: 'bun',
  define: {
    'process.env.LLMAN_SDD_VERSION': JSON.stringify(version),
  },
  compile: { outfile },
});

if (!result.success) {
  console.error('build failed:', result.logs);
  process.exit(1);
}
console.log(`built ${outfile} (version ${version})`);
