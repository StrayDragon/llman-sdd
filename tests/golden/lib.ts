// Shared golden helpers: render skills products with v2's own renderer
// (runInit) into a fresh temp project using a config equivalent to this
// repo's llmanspec/config.yaml, and diff against tests/golden/baseline/
// (version-normalized). The baseline is the v2 self-snapshot (single SSOT).
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInit } from '@llman-sdd/core';

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

/** Render skills with v2 (runInit) into a fresh temp project. */
export function renderV2Skills(): RenderResult {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'llman-sdd-golden-'));
  mkdirSync(join(tmpRoot, 'llmanspec'), { recursive: true });
  writeFileSync(join(tmpRoot, 'llmanspec', 'config.yaml'), CONFIG_YAML);
  const version = '0.1.0';
  runInit(tmpRoot, { update: true, version });
  const skillsDir = join(tmpRoot, '.agents', 'skills');
  if (!existsSync(skillsDir)) {
    throw new Error(`v2 did not render skills into ${skillsDir}`);
  }
  return { tmpRoot, skillsDir, version };
}

/** Copy rendered skills into the committed baseline. Returns copied entries. */
export function captureBaseline(skillsDir: string, version: string): string[] {
  rmSync(BASELINE_DIR, { recursive: true, force: true });
  cpSync(skillsDir, join(BASELINE_DIR, 'skills'), { recursive: true });
  writeFileSync(join(BASELINE_DIR, 'VERSION'), `${version}\n`);
  return readdirSync(join(BASELINE_DIR, 'skills'));
}
