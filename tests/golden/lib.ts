// Shared golden-baseline helper: render skills products with v1 (Rust llman)
// into a temp dir, using a config equivalent to this repo's llmanspec/config.yaml.
//
// The captured products are byte-exact contracts: once v2 implements
// `init --update`, its output must diff clean against tests/golden/baseline/.
// The baseline is tied to llman 0.0.77 (see tests/golden/baseline/VERSION).
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const GOLDEN_DIR = import.meta.dirname;
export const BASELINE_DIR = join(GOLDEN_DIR, 'baseline');

/** Equivalent to the repo's llmanspec/config.yaml (locale zh-Hans + bdd-on). */
export const CONFIG_YAML = `# yaml-language-server: $schema=https://raw.githubusercontent.com/StrayDragon/llman/main/artifacts/schema/configs/en/llmanspec-config.schema.json
schema: spec-driven
locale: zh-Hans

bdd:
  run_command: "bun test tests/bdd"
  bindings:
    - kind: tags
      tags: [executable]
`;

export interface RenderResult {
  tmpRoot: string;
  skillsDir: string;
  version: string;
}

/** Run `llman sdd init` (v1) in a fresh temp project; return rendered skills dir. */
export function renderV1Skills(): RenderResult {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'llman-sdd-golden-'));
  const llmanspecDir = join(tmpRoot, 'llmanspec');

  const runLlman = (args: string[]) =>
    Bun.spawnSync(['llman', 'sdd', ...args], {
      cwd: tmpRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

  const init = runLlman(['init']);
  if (init.exitCode !== 0) {
    throw new Error(`llman sdd init failed:\n${init.stderr.toString()}`);
  }
  // Overwrite the scaffolded config with ours (locale zh-Hans + bdd-on), then
  // re-render so skills reflect the repo-equivalent configuration.
  writeFileSync(join(llmanspecDir, 'config.yaml'), CONFIG_YAML);
  const update = runLlman(['init', '--update']);
  if (update.exitCode !== 0) {
    throw new Error(`llman sdd init --update failed:\n${update.stderr.toString()}`);
  }

  const skillsDir = join(tmpRoot, '.agents', 'skills');
  if (!existsSync(skillsDir)) {
    throw new Error(`v1 did not render skills into ${skillsDir}`);
  }

  const version = detectV1Version();
  return { tmpRoot, skillsDir, version };
}

function detectV1Version(): string {
  const proc = Bun.spawnSync(['llman', '--version'], { stdout: 'pipe', stderr: 'pipe' });
  return proc.exitCode === 0 ? proc.stdout.toString().trim() : 'unknown';
}

/** Copy rendered skills into the committed baseline. Returns copied entries. */
export function captureBaseline(result: RenderResult): string[] {
  rmSync(BASELINE_DIR, { recursive: true, force: true });
  cpSync(result.skillsDir, join(BASELINE_DIR, 'skills'), { recursive: true });
  writeFileSync(join(BASELINE_DIR, 'VERSION'), `${result.version}\n`);
  return readdirSync(join(BASELINE_DIR, 'skills'));
}
