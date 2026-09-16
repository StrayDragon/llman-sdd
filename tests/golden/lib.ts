// Shared golden/live-parity helpers:
//   - skills golden: render products with v1 (Rust llman) into a temp dir,
//     byte-exact against tests/golden/baseline/ (tied to llman 0.0.78).
//   - live parity gates: spawn helpers + the text normalizer shared by
//     check-cli.ts / check-validate.ts / tests/bdd/steps/domain.ts.
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const GOLDEN_DIR = import.meta.dirname;
export const BASELINE_DIR = join(GOLDEN_DIR, 'baseline');
export const REPO_ROOT = join(GOLDEN_DIR, '..', '..');
export const V2_CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

/**
 * Spawn a tool and capture stdout+stderr merged — v1 prints progress lines to
 * stderr and results to stdout, so gates normalize over both.
 */
export function runCapture(cmd: string[], args: string[], cwd: string = REPO_ROOT): string {
  const proc = Bun.spawnSync([cmd[0] as string, ...cmd.slice(1), ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return `${proc.stdout.toString()}\n${proc.stderr.toString()}`;
}

/** Text normalizer for live v1↔v2 comparisons (human tables, relative time,
 * timestamps, stale-detail wording). Line order is presentation — compare as
 * sorted sets. */
export function normalizeCliText(s: string): string {
  return (
    s
      .split('\n')
      .map((l) => l.trim().replaceAll(/\s+/gu, ' '))
      .filter((l) => l !== '' && !l.startsWith('INFO:'))
      .join('\n')
      .replaceAll(/\b\d+[smhd]\s+ago\b/gu, '<REL>')
      .replace('just now', '<REL>')
      .replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/gu, '<TS>')
      .replaceAll(/\d{4}-\d{2}-\d{2}/gu, '<DATE>')
      .replaceAll(/^stale: \S+ \(\d+\)$/gm, 'stale: <CAP> (<N>)')
      .replaceAll(/^- (INFO|DEFERRED|OK)$/gm, '  - <STALE>')
      .replaceAll(/^Error: review found \d+ CRITICAL finding\(s\).*$/gm, '')
      .replaceAll(/\(built [^,]+,/gu, '(built <TS>,')
      .replaceAll('chat model: <unset>', 'chat model: <MODEL>')
      .replaceAll('chat_model=<unset>', 'chat_model=<MODEL>')
      // replacements above can leave empty lines (e.g. stripped Error lines)
      .split('\n')
      .filter((l) => l !== '')
      .join('\n')
  );
}

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
