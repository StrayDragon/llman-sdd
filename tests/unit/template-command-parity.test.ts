import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
// Template↔CLI command-parity gate (monorepo-structure r67).
//
// Scans every literal `llman-sdd <path> ... --<flag>` reference in the
// template sources (packages/core/templates/**) and verifies it against the
// real CLI surface by probing `<path> --help`. Catches drift like a template
// teaching `show --json` when the command only accepts `--output json`.
// Rendered artifacts (.agents/skills, golden baselines) are downstream of the
// templates — the source being clean implies they are.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const TEMPLATES_DIR = join(REPO_ROOT, 'packages', 'core', 'templates');
const CLI_ENTRY = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

function collectMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectMarkdown(full));
    } else if (entry.endsWith('.md')) {
      out.push(full);
    }
  }
  return out.toSorted();
}

interface CommandRef {
  file: string;
  /** Command path words after `llman-sdd`, e.g. ["change", "finalize"]. */
  path: string[];
  /** Long flags referenced on the same line, e.g. ["--output", "--type"]. */
  flags: string[];
}

// Reference = `llman-sdd` + tokens up to a backtick/pipe/redirect/dash
// punctuation boundary. Command-path candidates are lowercase kebab words
// (subcommand depth ≤ 2); `<placeholders>`, `show/list/x` shorthand and
// positional values are not path words.
const REF_PATTERN = /llman-sdd\s+([^`|\n>—（]+)/gu;
const PATH_WORD = /^[a-z][a-z0-9-]*$/u;

function extractRefs(file: string, text: string): CommandRef[] {
  const refs: CommandRef[] = [];
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(REF_PATTERN)) {
      const raw = m[1];
      if (raw === undefined) continue;
      const tokens = raw
        .trim()
        .split(/\s+/u)
        .filter((t) => t !== '');
      const path: string[] = [];
      const flags: string[] = [];
      for (const token of tokens) {
        if (token.startsWith('--')) {
          flags.push(token);
          continue;
        }
        // A positional-looking word still counts toward the command path only
        // while no flag has been seen (`graph c50 --depth 2` → path stays
        // ["graph"]; the probe falls back to the shorter path on failure).
        if (flags.length === 0 && path.length < 2 && PATH_WORD.test(token)) {
          path.push(token);
        }
      }
      if (path.length > 0) refs.push({ file, path, flags });
    }
  }
  return refs;
}

interface Probe {
  ok: boolean;
  helpText: string;
}

function probeHelp(path: string[]): Probe {
  const run = spawnSync('bun', [CLI_ENTRY, ...path, '--help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ok = run.status === 0;
  return { ok, helpText: ok ? `${run.stdout ?? ''}\n${run.stderr ?? ''}` : '' };
}

function flagRegistered(helpText: string, flag: string): boolean {
  // Word-boundary match: `--spec` must NOT be satisfied by `--specs`.
  return new RegExp(`${flag}(?![a-z-])`, 'u').test(helpText);
}

test('template command references match the CLI surface (r67)', () => {
  const files = collectMarkdown(TEMPLATES_DIR);
  const refs: CommandRef[] = [];
  for (const file of files) {
    refs.push(...extractRefs(file, readFileSync(file, 'utf8')));
  }
  expect(refs.length).toBeGreaterThan(0);

  // Probe cache: same path words share one --help run.
  const probes = new Map<string, Probe>();
  const violations: string[] = [];
  const seenFlagsPerPath = new Map<string, Set<string>>();

  // Program-level flags (e.g. --max-scan-depth) are accepted by every
  // subcommand at runtime via commander's global-option propagation, even
  // though they only appear in the top-level help.
  const topLevel = probeHelp([]);
  expect(topLevel.ok).toBe(true);

  for (const ref of refs) {
    const key = ref.path.join(' ');
    let probe = probes.get(key);
    if (!probe) {
      // Longest path first, then fall back to the shorter command.
      probe = probeHelp(ref.path);
      if (!probe.ok && ref.path.length > 1) probe = probeHelp(ref.path.slice(0, 1));
      probes.set(key, probe);
    }
    if (!probe.ok) {
      violations.push(`[${ref.file}] llman-sdd ${key} → unknown command path`);
      continue;
    }
    let checked = seenFlagsPerPath.get(key);
    if (!checked) {
      checked = new Set<string>();
      seenFlagsPerPath.set(key, checked);
    }
    for (const flag of ref.flags) {
      if (checked.has(flag)) continue;
      checked.add(flag);
      const known = flagRegistered(probe.helpText, flag) || flagRegistered(topLevel.helpText, flag);
      if (!known) {
        violations.push(`[${ref.file}] llman-sdd ${key} ${flag} → flag not registered on command`);
      }
    }
  }

  expect(violations).toEqual([]);
});
