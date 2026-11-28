/**
 * `llman-sdd theorem` subcommands (validation r161):
 * - `list`: inspect parsed Human Theorems & read-only/lock status
 * - `check`: validate syntax, duplicate ids, `.theorems.lock.json` integrity, and optional `--run-gates`
 * - `lock`: seal `.theorems.lock.json` and apply optional OS `chmod 0444` (`--root` prints sudo hardening recipe)
 * - `unlock`: restore `chmod 0644` for human editing
 * Strictly Node-compatible (zero Bun.* APIs).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  THEOREMS_DIR_REL,
  THEOREMS_LOCK_FILE,
  THEOREMS_LOCK_REL,
  buildTheoremLockManifest,
  theoremLockManifestSchema,
  validateTheoremSet,
  verifyTheoremLockManifest,
  type StudioTheoremDto,
  type TheoremLockManifest,
  type TheoremLockStatus,
  type TheoremSourceFile,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import { CliError, resolveCommandRoot, type CliContext } from '../cli-shared.ts';

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export interface LoadedWorkspaceTheorems {
  dirAbs: string;
  files: TheoremSourceFile[];
  theorems: StudioTheoremDto[];
  validationIssues: string[];
  lockStatus: TheoremLockStatus;
  lockIssues: string[];
}

export function loadWorkspaceTheorems(instanceRoot: string): LoadedWorkspaceTheorems {
  const dirAbs = join(instanceRoot, THEOREMS_DIR_REL);
  if (!existsSync(dirAbs)) {
    return {
      dirAbs,
      files: [],
      theorems: [],
      validationIssues: [],
      lockStatus: 'none',
      lockIssues: [],
    };
  }
  const names = readdirSync(dirAbs)
    .filter((n) => n.endsWith('.md') && !n.startsWith('.'))
    .toSorted();

  const files: TheoremSourceFile[] = [];
  const readOnlyByFile = new Map<string, boolean>();
  for (const name of names) {
    const abs = join(dirAbs, name);
    const st = statSync(abs);
    if (!st.isFile()) continue;
    const rel = `${THEOREMS_DIR_REL}/${name}`;
    files.push({ file: rel, content: readFileSync(abs, 'utf8') });
    // Read-only if owner-write bit (0o200) is cleared
    readOnlyByFile.set(rel, (st.mode & 0o200) === 0);
  }

  const validation = validateTheoremSet(files);
  const lockAbs = join(instanceRoot, THEOREMS_LOCK_REL);
  let manifest: TheoremLockManifest | null = null;
  const lockParseIssues: string[] = [];
  if (existsSync(lockAbs)) {
    try {
      const raw = JSON.parse(readFileSync(lockAbs, 'utf8')) as unknown;
      manifest = theoremLockManifestSchema.parse(raw);
    } catch (error) {
      lockParseIssues.push(
        `corrupt ${THEOREMS_LOCK_REL}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const verified = verifyTheoremLockManifest(files, manifest, sha256Hex);
  const lockStatus: TheoremLockStatus =
    files.length === 0 && !manifest
      ? 'none'
      : lockParseIssues.length > 0
        ? 'tampered'
        : verified.status;
  const lockIssues = [...lockParseIssues, ...verified.issues];

  const theorems: StudioTheoremDto[] = validation.theorems.map((t) => ({
    ...t,
    readOnly: readOnlyByFile.get(t.file) ?? false,
  }));

  return {
    dirAbs,
    files,
    theorems,
    validationIssues: validation.issues,
    lockStatus,
    lockIssues,
  };
}

export function registerTheorem(program: Command, ctx: CliContext): void {
  const theorem = program
    .command('theorem')
    .description('Manage human-owned read-only invariants (llmanspec/theorems/)');

  theorem
    .command('list')
    .description('List all Human Theorems and their lock status')
    .option('--json', 'emit JSON output')
    .option('-d, --directory <path>', 'target project directory')
    .action((options: { json?: boolean; directory?: string }) => {
      const root = resolveCommandRoot(ctx, options.directory);
      const loaded = loadWorkspaceTheorems(root);
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              lockStatus: loaded.lockStatus,
              theorems: loaded.theorems,
              issues: [...loaded.validationIssues, ...loaded.lockIssues],
            },
            null,
            2,
          ),
        );
        return;
      }
      if (loaded.theorems.length === 0) {
        console.log(
          `No Human Theorems found under ${THEOREMS_DIR_REL}/ (status: ${loaded.lockStatus}).`,
        );
        return;
      }
      console.log(
        `Human Theorems (${String(loaded.theorems.length)}, lock: ${loaded.lockStatus}):`,
      );
      for (const th of loaded.theorems) {
        const ro = th.readOnly ? ' [ro]' : '';
        console.log(`  - theorem:${th.id} (${th.title})${ro} — ${th.file}`);
        console.log(`    statement: ${th.statement}`);
        if (th.gate) console.log(`    gate: ${th.gate}`);
      }
    });

  theorem
    .command('check')
    .description(
      'Verify Human Theorem syntax, lock manifest integrity, and optional executable gates',
    )
    .option('--run-gates', 'execute each theorem declared gate command')
    .option('--json', 'emit JSON output')
    .option('-d, --directory <path>', 'target project directory')
    .action((options: { runGates?: boolean; json?: boolean; directory?: string }) => {
      const root = resolveCommandRoot(ctx, options.directory);
      const loaded = loadWorkspaceTheorems(root);
      const issues = [...loaded.validationIssues, ...loaded.lockIssues];
      const gateResults: Array<{ id: string; gate: string; ok: boolean; exitCode: number }> = [];

      if (options.runGates === true && issues.length === 0) {
        for (const th of loaded.theorems) {
          if (!th.gate) continue;
          const proc = spawnSync(th.gate, {
            cwd: root,
            shell: true,
            stdio: options.json ? 'pipe' : 'inherit',
          });
          const code = proc.status ?? 1;
          gateResults.push({ id: th.id, gate: th.gate, ok: code === 0, exitCode: code });
          if (code !== 0) {
            issues.push(`theorem:${th.id} gate failed (exit ${String(code)}): ${th.gate}`);
          }
        }
      }

      const ok =
        issues.length === 0 && (loaded.lockStatus === 'sealed' || loaded.lockStatus === 'none');
      if (options.json) {
        console.log(
          JSON.stringify(
            {
              ok,
              lockStatus: loaded.lockStatus,
              theoremCount: loaded.theorems.length,
              gateResults,
              issues,
            },
            null,
            2,
          ),
        );
      } else if (ok) {
        console.log(
          `Human Theorems check passed (${String(loaded.theorems.length)} theorem(s), lock: ${loaded.lockStatus}).`,
        );
      } else {
        for (const msg of issues) console.error(`  - ${msg}`);
      }

      if (!ok) {
        throw new CliError(`Human Theorems check failed (${String(issues.length)} issue(s))`, 1);
      }
    });

  theorem
    .command('lock')
    .description('Seal .theorems.lock.json and set theorem files read-only (0444)')
    .option('--no-chmod', 'seal lock manifest without changing filesystem permissions')
    .option('--root', 'print sudo chown root:root hardening commands for OS-level immutability')
    .option('-d, --directory <path>', 'target project directory')
    .action((options: { chmod?: boolean; root?: boolean; directory?: string }) => {
      const root = resolveCommandRoot(ctx, options.directory);
      const loaded = loadWorkspaceTheorems(root);
      if (loaded.files.length === 0) {
        throw new CliError(`no theorem markdown files found in ${THEOREMS_DIR_REL}/`, 1);
      }
      if (loaded.validationIssues.length > 0) {
        throw new CliError(
          `cannot lock invalid theorems: ${loaded.validationIssues.join('; ')}`,
          1,
        );
      }
      const lockAbs = join(root, THEOREMS_LOCK_REL);
      if (existsSync(lockAbs)) {
        try {
          chmodSync(lockAbs, 0o644);
        } catch {
          // Proceed to write if writable
        }
      }
      const manifest = buildTheoremLockManifest(loaded.files, sha256Hex, new Date().toISOString());
      writeFileSync(lockAbs, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      if (options.chmod !== false) {
        for (const f of loaded.files) {
          chmodSync(join(root, f.file), 0o444);
        }
        chmodSync(lockAbs, 0o444);
      }

      console.log(
        `Sealed ${String(loaded.files.length)} theorem file(s) in ${THEOREMS_LOCK_REL}${options.chmod === false ? ' (--no-chmod)' : ' (chmod 0444)'}.`,
      );
      if (options.root === true) {
        const targets = [
          ...loaded.files.map((f) => `"${join(root, f.file)}"`),
          `"${lockAbs}"`,
        ].join(' ');
        console.log('\nOptional OS root-ownership hardening (human runs explicitly):');
        console.log(`  Lock:   sudo chown root:root ${targets} && sudo chmod 0444 ${targets}`);
        console.log(
          `  Unlock: sudo chown "$(id -un):$(id -gn)" ${targets} && chmod 0644 ${targets}`,
        );
        console.log(
          '  Note: unlock before git checkout/merge/archive if tracked theorem files change across branches.',
        );
      }
    });

  theorem
    .command('unlock')
    .description('Restore writable permissions (0644) on theorem files for human editing')
    .option('-d, --directory <path>', 'target project directory')
    .action((options: { directory?: string }) => {
      const root = resolveCommandRoot(ctx, options.directory);
      const dirAbs = join(root, THEOREMS_DIR_REL);
      if (!existsSync(dirAbs)) {
        throw new CliError(`${THEOREMS_DIR_REL}/ does not exist`, 1);
      }
      const targets = readdirSync(dirAbs)
        .filter((n) => n.endsWith('.md') || n === THEOREMS_LOCK_FILE)
        .map((n) => join(dirAbs, n));
      let unlocked = 0;
      for (const abs of targets) {
        try {
          chmodSync(abs, 0o644);
          unlocked += 1;
        } catch (error) {
          throw new CliError(
            `cannot unlock ${abs} (if owned by root, run sudo chown first): ${error instanceof Error ? error.message : String(error)}`,
            1,
          );
        }
      }
      console.log(
        `Unlocked ${String(unlocked)} file(s) under ${THEOREMS_DIR_REL}/ (0644). Run \`llman-sdd theorem lock\` after editing.`,
      );
    });
}
