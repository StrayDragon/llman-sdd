// Golden drift gate: re-render skills with v1 and diff against the committed
// baseline under tests/golden/baseline/. Additionally renders the same config
// with v2 (packages/core) and requires version-normalized parity — the
// acceptance target of the init-generators capability.
// Exit code 1 on drift. Requires `llman` (v1) on PATH. Run: bun run golden:check
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runInit } from '@llman-sdd/core';

import { BASELINE_DIR, CONFIG_YAML, renderV1Skills } from './lib.ts';

const VERSION_RE = /\b\d+\.\d+\.\d+\b/gu;

/** Walk a rendered skills dir into a map of version-normalized file contents. */
function normalizeTree(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    const full = join(root, rel);
    for (const name of readdirSync(full).toSorted()) {
      const childRel = rel === '' ? name : `${rel}/${name}`;
      const childFull = join(root, childRel);
      if (statSync(childFull).isDirectory()) {
        walk(childRel);
      } else {
        out.set(childRel, readFileSync(childFull, 'utf8').replaceAll(VERSION_RE, '<VER>'));
      }
    }
  };
  if (existsSync(root)) walk('');
  return out;
}

/** Render skills with v2 into a fresh temp project (repo-equivalent config). */
function renderV2Skills(): { tmpRoot: string; skillsDir: string } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'llman-sdd-golden-v2-'));
  mkdirSync(join(tmpRoot, 'llmanspec'), { recursive: true });
  writeFileSync(join(tmpRoot, 'llmanspec', 'config.yaml'), CONFIG_YAML);
  runInit(tmpRoot, { update: true, version: '0.1.0' });
  return { tmpRoot, skillsDir: join(tmpRoot, '.agents', 'skills') };
}

function diffTrees(a: Map<string, string>, b: Map<string, string>, label: string): boolean {
  const keys = [...new Set([...a.keys(), ...b.keys()])].toSorted();
  let same = true;
  for (const key of keys) {
    const va = a.get(key);
    const vb = b.get(key);
    if (va !== vb) {
      same = false;
      console.error(
        `[${label}] drift at ${key}:\n--- baseline\n+++ other\n${va ?? '<missing>'}\n---\n${vb ?? '<missing>'}`,
      );
    }
  }
  return same;
}

const v1 = renderV1Skills();
try {
  const baselineVersion = readFileSync(join(BASELINE_DIR, 'VERSION'), 'utf8').trim();
  const baselineSkills = join(BASELINE_DIR, 'skills');
  try {
    execFileSync('diff', ['-r', '--exclude', 'VERSION', v1.skillsDir, baselineSkills], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (err) {
    const e = err as { stderr?: Buffer };
    console.error('golden drift detected:\n' + (e.stderr?.toString() ?? String(err)));
    process.exit(1);
  }
  console.log(`golden check passed: fresh v1 render matches baseline (${baselineVersion})`);

  // v2 channel: version-normalized parity against the same baseline.
  const v2 = renderV2Skills();
  try {
    const baselineTree = normalizeTree(baselineSkills);
    const v2Tree = normalizeTree(v2.skillsDir);
    if (!diffTrees(baselineTree, v2Tree, 'v2-vs-baseline')) process.exit(1);
    console.log(`v2 render matches baseline (${v2Tree.size} files, versions normalized)`);
  } finally {
    rmSync(v2.tmpRoot, { recursive: true, force: true });
  }
} finally {
  rmSync(v1.tmpRoot, { recursive: true, force: true });
}
