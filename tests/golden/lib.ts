// Shared golden helpers: render skills products with v2's own renderer
// (runInit) into a fresh temp project using a config equivalent to this
// repo's llmanspec/config.yaml, and diff against tests/golden/baseline/
// (version-normalized). The baseline is the v2 self-snapshot (single SSOT).
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig, runInit, type TemplateIo } from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';
import { REPO_ROOT } from '../helpers/spawn.ts';

export const GOLDEN_DIR = import.meta.dirname;
export const BASELINE_DIR = join(GOLDEN_DIR, 'baseline');
/** The repo's own committed skills (dogfooding agents read these directly). */
export const REPO_SKILLS_DIR = join(REPO_ROOT, '.agents', 'skills');
const MANAGED_PREFIX = 'llman-sdd-';

/** Real-filesystem adapter for template resources. */
const templateIo: TemplateIo = {
  exists: (p) => existsSync(p),
  readText: (p) => readFileSync(p, 'utf8'),
};

/** Equivalent to the repo's llmanspec/config.yaml (locale zh-Hans + bdd-on). */
export const CONFIG_YAML = `# yaml-language-server: $schema=https://raw.githubusercontent.com/StrayDragon/llman/main/artifacts/schema/configs/en/llmanspec-config.schema.json
schema: spec-driven
locale: zh-Hans

bdd:
  run_command: "bun test tests/bdd"
`;

/** Same shape as CONFIG_YAML modulo locale — the en baseline exercises the same
 * conditional surface (bdd block) so en-only template drift is gated, not just zh. */
export const CONFIG_YAML_EN = CONFIG_YAML.replace('locale: zh-Hans', 'locale: en');

export interface RenderResult {
  tmpRoot: string;
  skillsDir: string;
  version: string;
}

/** Render skills with v2 (runInit) into a fresh temp project. */
export function renderV2Skills(locale: 'zh-Hans' | 'en' = 'zh-Hans'): RenderResult {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'llman-sdd-golden-'));
  mkdirSync(join(tmpRoot, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(tmpRoot, 'llmanspec', 'config.yaml'),
    locale === 'en' ? CONFIG_YAML_EN : CONFIG_YAML,
  );
  const version = '0.1.0';
  runInit(makeNodeIo(tmpRoot), templateIo, { update: true, version });
  const skillsDir = join(tmpRoot, '.agents', 'skills');
  if (!existsSync(skillsDir)) {
    throw new Error(`v2 did not render skills into ${skillsDir}`);
  }
  return { tmpRoot, skillsDir, version };
}

const VERSION_RE = /\b\d+\.\d+\.\d+\b/gu;

/**
 * Walk a skills dir into a map of version-normalized file contents (the local
 * package version may move without touching template contracts). `keepTopDir`
 * filters first-level entries.
 */
export function normalizeTree(
  root: string,
  keepTopDir: (name: string) => boolean = () => true,
): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const name of readdirSync(join(root, rel)).toSorted()) {
      if (rel === '' && !keepTopDir(name)) continue;
      const child = rel === '' ? name : `${rel}/${name}`;
      if (statSync(join(root, child)).isDirectory()) walk(child);
      else out.set(child, readFileSync(join(root, child), 'utf8').replaceAll(VERSION_RE, '<VER>'));
    }
  };
  if (existsSync(root)) walk('');
  return out;
}

export interface TreeDiff {
  file: string;
  kind: 'missing' | 'extra' | 'changed';
}

/** Files absent from `other` are `missing`, absent from `baseline` are `extra`. */
export function diffTrees(baseline: Map<string, string>, other: Map<string, string>): TreeDiff[] {
  const diffs: TreeDiff[] = [];
  for (const file of [...new Set([...baseline.keys(), ...other.keys()])].toSorted()) {
    const a = baseline.get(file);
    const b = other.get(file);
    if (a === b) continue;
    diffs.push({ file, kind: b === undefined ? 'missing' : a === undefined ? 'extra' : 'changed' });
  }
  return diffs;
}

export function formatTreeDiffs(diffs: readonly TreeDiff[]): string {
  return diffs.map((d) => `${d.kind}: ${d.file}`).join('\n');
}

/**
 * The freshness diff is only meaningful if the repo renders with the same
 * config the golden baseline was captured with.
 */
export function assertRepoConfigMatchesGolden(): void {
  const repo = loadConfig(readFileSync(join(REPO_ROOT, 'llmanspec', 'config.yaml'), 'utf8'));
  const golden = loadConfig(CONFIG_YAML);
  if (repo.locale !== golden.locale || repo.bdd?.run_command !== golden.bdd?.run_command) {
    throw new Error(
      'golden CONFIG_YAML drifted from llmanspec/config.yaml (locale / bdd.run_command)',
    );
  }
}

/** Committed `llman-sdd-*` skills under `skillsDir` vs the zh-Hans baseline. */
export function diffRepoSkills(skillsDir: string = REPO_SKILLS_DIR): TreeDiff[] {
  return diffTrees(
    normalizeTree(join(BASELINE_DIR, 'skills')),
    normalizeTree(skillsDir, (name) => name.startsWith(MANAGED_PREFIX)),
  );
}

/** Copy rendered skills into the committed baseline under <subdir>. Returns copied entries. */
export function captureBaseline(skillsDir: string, version: string, subdir = 'skills'): string[] {
  rmSync(join(BASELINE_DIR, subdir), { recursive: true, force: true });
  cpSync(skillsDir, join(BASELINE_DIR, subdir), { recursive: true });
  writeFileSync(join(BASELINE_DIR, 'VERSION'), `${version}\n`);
  return readdirSync(join(BASELINE_DIR, subdir));
}
