/**
 * `llman-sdd studio` CLI-first bidirectional negotiation command group (studio-cli r134-r137).
 * All pure graph validation, semantic diff, revision, storage, and lossless .feature rendering
 * delegate directly to `@llman-sdd/core` — zero domain logic duplication here.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyRevisionOpsToMachine,
  cloneMachineDraft,
  computeMachineDiff,
  currentBranch,
  defaultBranch,
  deleteStudioState,
  formatSemanticDiff,
  hasBlockingDiagnostics,
  listStudioStates,
  nextReqId,
  previewFeatureUnifiedDiff,
  proposeRevision,
  readStudioState,
  renderUpdatedFeatureSource,
  replyStudioComment,
  StudioSyncError,
  validateMachineGraph,
  validateStateId,
  writeStudioState,
  type MachineDiagnostic,
  type MachineDraft,
  type RevisionOp,
  type SemanticAnchor,
  type StudioStateDoc,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addSpecDirOption,
  CliError,
  exitWith,
  reRootContext,
  resolveRootSpecsDir,
  type CliContext,
} from '../cli-shared.ts';
import { registerStudioMcp } from './studioMcp.ts';
import { makeNodeStudioStateIo, resolveStateIdOrThrow } from './studioShared.ts';

export { makeNodeStudioStateIo, resolveStateIdOrThrow };

function addJsonFlags(cmd: Command): void {
  cmd
    .option('--json', 'emit structured JSON')
    .option('--compact-json', 'emit single-line compact JSON');
}

function emitStudioOutput(
  payload: unknown,
  options: { json?: boolean; compactJson?: boolean },
  humanFn: () => string,
): void {
  if (options.compactJson === true) {
    console.log(JSON.stringify(payload));
    return;
  }
  if (options.json === true) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(humanFn());
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function assertNonEmptyString(val: unknown, field: string): string {
  if (typeof val !== 'string' || val.trim() === '') {
    throw new CliError(`invalid revision op: '${field}' must be a non-empty string`, 2);
  }
  return val;
}

function assertOptionalString(val: unknown, field: string): string | undefined {
  if (val === undefined) return undefined;
  if (typeof val !== 'string') {
    throw new CliError(`invalid revision op: '${field}' must be a string`, 2);
  }
  return val;
}

function parseRevisionOp(raw: unknown, idx: number): RevisionOp {
  if (!isPlainObject(raw) || typeof raw.op !== 'string') {
    throw new CliError(`invalid revision op at index ${String(idx)}: expected object with 'op'`, 2);
  }
  switch (raw.op) {
    case 'add_state':
      return { op: 'add_state', name: assertNonEmptyString(raw.name, `ops[${String(idx)}].name`) };
    case 'remove_state':
      return {
        op: 'remove_state',
        stateName: assertNonEmptyString(raw.stateName, `ops[${String(idx)}].stateName`),
      };
    case 'rename_state':
      return {
        op: 'rename_state',
        from: assertNonEmptyString(raw.from, `ops[${String(idx)}].from`),
        to: assertNonEmptyString(raw.to, `ops[${String(idx)}].to`),
      };
    case 'add_transition': {
      const guard = assertOptionalString(raw.guard, `ops[${String(idx)}].guard`);
      return {
        op: 'add_transition',
        from: assertNonEmptyString(raw.from, `ops[${String(idx)}].from`),
        event: assertNonEmptyString(raw.event, `ops[${String(idx)}].event`),
        ...(guard !== undefined ? { guard } : {}),
        to: assertNonEmptyString(raw.to, `ops[${String(idx)}].to`),
      };
    }
    case 'remove_transition': {
      const guard = assertOptionalString(raw.guard, `ops[${String(idx)}].guard`);
      return {
        op: 'remove_transition',
        from: assertNonEmptyString(raw.from, `ops[${String(idx)}].from`),
        event: assertNonEmptyString(raw.event, `ops[${String(idx)}].event`),
        ...(guard !== undefined ? { guard } : {}),
        to: assertNonEmptyString(raw.to, `ops[${String(idx)}].to`),
      };
    }
    case 'update_transition': {
      if (!isPlainObject(raw.match) || !isPlainObject(raw.next)) {
        throw new CliError(
          `invalid revision op at index ${String(idx)}: update_transition requires 'match' and 'next' objects`,
          2,
        );
      }
      const matchGuard = assertOptionalString(raw.match.guard, `ops[${String(idx)}].match.guard`);
      const nextFrom = assertOptionalString(raw.next.from, `ops[${String(idx)}].next.from`);
      const nextEvent = assertOptionalString(raw.next.event, `ops[${String(idx)}].next.event`);
      const nextGuard = assertOptionalString(raw.next.guard, `ops[${String(idx)}].next.guard`);
      const nextTo = assertOptionalString(raw.next.to, `ops[${String(idx)}].next.to`);
      return {
        op: 'update_transition',
        match: {
          from: assertNonEmptyString(raw.match.from, `ops[${String(idx)}].match.from`),
          event: assertNonEmptyString(raw.match.event, `ops[${String(idx)}].match.event`),
          ...(matchGuard !== undefined ? { guard: matchGuard } : {}),
          to: assertNonEmptyString(raw.match.to, `ops[${String(idx)}].match.to`),
        },
        next: {
          ...(nextFrom !== undefined ? { from: nextFrom } : {}),
          ...(nextEvent !== undefined ? { event: nextEvent } : {}),
          ...(nextGuard !== undefined ? { guard: nextGuard } : {}),
          ...(nextTo !== undefined ? { to: nextTo } : {}),
        },
      };
    }
    default:
      throw new CliError(
        `invalid revision op at index ${String(idx)}: unsupported op '${raw.op}'`,
        2,
      );
  }
}

interface ParsedRevisionPayload {
  machineKey: string;
  ops: RevisionOp[];
  rationale: string;
}

function parseRevisionPayload(
  rawText: string,
  doc: StudioStateDoc,
  explicitMachineKey?: string,
  explicitRationale?: string,
): ParsedRevisionPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new CliError(
      `invalid revision JSON: ${error instanceof Error ? error.message : String(error)}`,
      2,
    );
  }

  let rawOps: unknown;
  let payloadMachineKey: string | undefined;
  let payloadRationale: string | undefined;

  if (Array.isArray(parsed)) {
    rawOps = parsed;
  } else if (isPlainObject(parsed)) {
    rawOps = parsed.ops;
    if (parsed.machineKey !== undefined) {
      if (typeof parsed.machineKey !== 'string' || parsed.machineKey.trim() === '') {
        throw new CliError("invalid revision payload: 'machineKey' must be a non-empty string", 2);
      }
      payloadMachineKey = parsed.machineKey.trim();
    }
    if (parsed.rationale !== undefined) {
      if (typeof parsed.rationale !== 'string') {
        throw new CliError("invalid revision payload: 'rationale' must be a string", 2);
      }
      payloadRationale = parsed.rationale;
    }
  } else {
    throw new CliError(
      'invalid revision payload: expected JSON array of RevisionOp or object { machineKey?, rationale?, ops }',
      2,
    );
  }

  if (!Array.isArray(rawOps) || rawOps.length === 0) {
    throw new CliError('invalid revision payload: ops must be a non-empty array', 2);
  }

  const ops = rawOps.map((item, idx) => parseRevisionOp(item, idx));
  const machineKeys = Object.keys(doc.machines);
  let machineKey = explicitMachineKey?.trim() || payloadMachineKey;

  if (!machineKey) {
    if (machineKeys.length === 1) {
      machineKey = machineKeys[0]!;
    } else if (machineKeys.length === 0) {
      throw new CliError(`studio state '${doc.id}' contains no machines`, 1);
    } else {
      throw new CliError(
        `multiple machines in state '${doc.id}' (${machineKeys.join(', ')}); specify --machine <key> or include machineKey in JSON`,
        2,
      );
    }
  }

  if (!doc.machines[machineKey]) {
    throw new CliError(`machine not found in state '${doc.id}': ${machineKey}`, 1);
  }

  const rationale = (explicitRationale ?? payloadRationale ?? 'Agent revision proposal').trim();
  return { machineKey, ops, rationale };
}

function readInputText(cwd: string, filePath?: string): string {
  if (filePath !== undefined && filePath !== '-') {
    const abs = resolve(cwd, filePath);
    if (!existsSync(abs)) {
      throw new CliError(`input file not found: ${filePath}`, 2);
    }
    return readFileSync(abs, 'utf8');
  }
  const text = readFileSync(0, 'utf8');
  if (text.trim() === '') {
    throw new CliError('empty JSON input on stdin (pass --file <path> or pipe JSON to stdin)', 2);
  }
  return text;
}

function formatAnchor(anchor: SemanticAnchor): string {
  if (anchor.kind === 'machine') return `machine:${anchor.machineKey}`;
  if (anchor.kind === 'state') return `state:${anchor.machineKey}#${anchor.stateUid}`;
  return `edge:${anchor.machineKey}#${anchor.edgeUid}`;
}

function tryCopyToClipboard(text: string): boolean {
  const candidates: Array<[string, string[]]> =
    process.platform === 'darwin'
      ? [['pbcopy', []]]
      : process.platform === 'win32'
        ? [['clip', []]]
        : [
            ['wl-copy', []],
            ['xclip', ['-selection', 'clipboard']],
            ['xsel', ['--clipboard', '--input']],
          ];

  for (const [cmd, args] of candidates) {
    const res = spawnSync(cmd, args, { input: text, encoding: 'utf8' });
    if (res.error === undefined && res.status === 0) {
      return true;
    }
  }
  return false;
}

function assertNonDefaultBranch(git: CliContext['git']): void {
  const branch = currentBranch(git);
  if (branch === null || branch === '') {
    throw new CliError(
      "refusing to write llmanspec/specs/ without a checked-out feature branch; run 'llman-sdd change start <id>' first (or pass --dry-run to preview)",
      1,
    );
  }
  let def: string | null = null;
  try {
    def = defaultBranch(git);
  } catch {
    def = null;
  }
  if (branch === def || branch === 'main' || branch === 'master') {
    throw new CliError(
      `refusing to write llmanspec/specs/ on default branch '${branch}'; run 'llman-sdd change start <id>' first (or pass --dry-run to preview)`,
      1,
    );
  }
}

interface MachineValidationSummary {
  machineKey: string;
  mode: MachineDraft['mode'];
  sourceFile: string;
  valid: boolean;
  diagnostics: MachineDiagnostic[];
}

export function registerStudio(program: Command, ctx: CliContext): void {
  const studio = program
    .command('studio')
    .description('Studio state-machine draft negotiation and spec sync');

  // --- studio state <list|prune> ---
  const stateGroup = studio.command('state').description('Manage local Studio draft state files');

  const stateList = stateGroup
    .command('list')
    .description('List local Studio drafts under .llman-sdd/studio/states/');
  addJsonFlags(stateList);
  addSpecDirOption(stateList);
  stateList.action((options: { json?: boolean; compactJson?: boolean; directory?: string }) => {
    const rctx = reRootContext(ctx, options.directory);
    const io = makeNodeStudioStateIo(rctx.root);
    const states = listStudioStates(io);
    emitStudioOutput({ states }, options, () => {
      if (states.length === 0) return 'No studio drafts found.';
      return states
        .map(
          (s) =>
            `${s.id}\t${s.title}\t(${String(s.machineCount)} machine${s.machineCount === 1 ? '' : 's'}, updated ${s.updatedAt})`,
        )
        .join('\n');
    });
  });

  const statePrune = stateGroup
    .command('prune')
    .description('Delete one or all local Studio drafts')
    .option('--id <state-id>', 'delete a single studio draft by id')
    .option('--all', 'delete all local studio drafts');
  addSpecDirOption(statePrune);
  statePrune.action((options: { id?: string; all?: boolean; directory?: string }) => {
    const hasId = options.id !== undefined;
    const hasAll = options.all === true;
    if (hasId === hasAll) {
      throw new CliError('specify exactly one of --id <state-id> or --all', 2);
    }
    const rctx = reRootContext(ctx, options.directory);
    const io = makeNodeStudioStateIo(rctx.root);
    if (hasId) {
      const targetId = validateStateId(options.id!);
      const removed = deleteStudioState(io, targetId);
      if (!removed) {
        throw new CliError(`studio state not found: ${targetId}`, 1);
      }
      console.log(`Pruned studio state: ${targetId}`);
      return;
    }
    const states = listStudioStates(io);
    let count = 0;
    for (const s of states) {
      if (deleteStudioState(io, s.id)) count += 1;
    }
    console.log(`Pruned ${String(count)} studio state(s).`);
  });

  // --- studio diff [state-id] ---
  const diffCmd = studio
    .command('diff')
    .description('Inspect semantic diffs, open comments, and Unified Diff preview for a draft')
    .argument('[state-id]', 'studio draft state id (auto-selected when exactly one exists)')
    .option('--no-unified', 'omit in-memory Unified Diff preview');
  addJsonFlags(diffCmd);
  addSpecDirOption(diffCmd);
  diffCmd.action(
    (
      stateIdArg: string | undefined,
      options: { unified?: boolean; json?: boolean; compactJson?: boolean; directory?: string },
    ) => {
      const rctx = reRootContext(ctx, options.directory);
      const io = makeNodeStudioStateIo(rctx.root);
      const stateId = resolveStateIdOrThrow(io, stateIdArg);
      const doc = readStudioState(io, stateId);
      const includeUnified = options.unified !== false;

      const machineDiffs = Object.entries(doc.machines).map(([machineKey, draft]) => {
        const semanticDiff = computeMachineDiff(draft);
        const semanticSummary = formatSemanticDiff(semanticDiff, draft);
        let unifiedDiff: string | null = null;
        let unifiedDiffError: string | undefined;

        if (includeUnified && semanticDiff.hasChanges) {
          try {
            const beforeText = rctx.io.exists(draft.sourceFile)
              ? rctx.io.readText(draft.sourceFile)
              : null;
            const afterText = renderUpdatedFeatureSource(beforeText, draft);
            unifiedDiff = previewFeatureUnifiedDiff(draft.sourceFile, beforeText, afterText);
          } catch (error) {
            if (error instanceof StudioSyncError) {
              unifiedDiffError = error.message;
            } else {
              throw error;
            }
          }
        }

        return {
          machineKey,
          mode: draft.mode,
          sourceFile: draft.sourceFile,
          hasChanges: semanticDiff.hasChanges,
          semanticDiff,
          semanticSummary,
          ...(includeUnified ? { unifiedDiff } : {}),
          ...(unifiedDiffError !== undefined ? { unifiedDiffError } : {}),
        };
      });

      const openComments = doc.comments.filter((c) => c.status === 'open');
      const pendingRevisions = doc.revisions.filter((r) => r.status === 'pending');

      const payload = {
        stateId: doc.id,
        title: doc.title,
        updatedAt: doc.updatedAt,
        machines: machineDiffs,
        openComments,
        pendingRevisions,
      };

      emitStudioOutput(payload, options, () => {
        const lines: string[] = [`# Studio Diff: ${doc.id} — ${doc.title}`];
        for (const m of machineDiffs) {
          lines.push('', `## ${m.machineKey} (${m.mode}) [${m.sourceFile}]`, m.semanticSummary);
          if (includeUnified && m.unifiedDiff) {
            lines.push('', '### Unified Diff Preview', m.unifiedDiff.trimEnd());
          } else if (m.unifiedDiffError) {
            lines.push('', `[preview unavailable: ${m.unifiedDiffError}]`);
          }
        }
        if (openComments.length > 0) {
          lines.push('', `## Open Comments (${String(openComments.length)})`);
          for (const c of openComments) {
            lines.push(`- [${c.id}] (${c.author}, ${formatAnchor(c.anchor)}): ${c.body}`);
          }
        }
        if (pendingRevisions.length > 0) {
          lines.push('', `## Pending Revisions (${String(pendingRevisions.length)})`);
          for (const r of pendingRevisions) {
            lines.push(
              `- [${r.id}] (${r.machineKey}): ${r.rationale} (${String(r.ops.length)} op(s))`,
            );
          }
        }
        return lines.join('\n');
      });
    },
  );

  // --- studio validate [state-id] ---
  const validateCmd = studio
    .command('validate')
    .description('Run full E1-E4/W1-W2 graph validation on a draft (with optional --patch preview)')
    .argument('[state-id]', 'studio draft state id (auto-selected when exactly one exists)')
    .option(
      '--patch <path>',
      'JSON RevisionOp[] patch file or "-" for stdin (in-memory preview only)',
    )
    .option('--machine <key>', 'target machine key when --patch is a bare RevisionOp[] array');
  addJsonFlags(validateCmd);
  addSpecDirOption(validateCmd);
  validateCmd.action(
    (
      stateIdArg: string | undefined,
      options: {
        patch?: string;
        machine?: string;
        json?: boolean;
        compactJson?: boolean;
        directory?: string;
      },
    ) => {
      const rctx = reRootContext(ctx, options.directory);
      const io = makeNodeStudioStateIo(rctx.root);
      const stateId = resolveStateIdOrThrow(io, stateIdArg);
      const doc = readStudioState(io, stateId);

      const workingMachines: Record<string, MachineDraft> = {};
      for (const [k, d] of Object.entries(doc.machines)) {
        workingMachines[k] = cloneMachineDraft(d);
      }

      if (options.patch !== undefined) {
        const rawText = readInputText(ctx.cwd, options.patch);
        const { machineKey, ops } = parseRevisionPayload(rawText, doc, options.machine);
        const targetDraft = workingMachines[machineKey];
        if (!targetDraft || !targetDraft.current) {
          throw new CliError(`cannot patch machine without current graph: ${machineKey}`, 1);
        }
        targetDraft.current = applyRevisionOpsToMachine(targetDraft.current, ops);
      }

      const results: MachineValidationSummary[] = [];
      let errorCount = 0;
      let warningCount = 0;

      for (const [machineKey, draft] of Object.entries(workingMachines)) {
        if (draft.mode === 'remove') {
          results.push({
            machineKey,
            mode: draft.mode,
            sourceFile: draft.sourceFile,
            valid: true,
            diagnostics: [],
          });
          continue;
        }
        const diagnostics = draft.current
          ? validateMachineGraph(draft.current)
          : [
              {
                code: 'E1',
                severity: 'error' as const,
                targetKind: 'machine' as const,
                targetId: null,
                message: 'E1 structure: machine draft has no current graph',
              },
            ];
        for (const d of diagnostics) {
          if (d.severity === 'error') errorCount += 1;
          else warningCount += 1;
        }
        results.push({
          machineKey,
          mode: draft.mode,
          sourceFile: draft.sourceFile,
          valid: !hasBlockingDiagnostics(diagnostics),
          diagnostics,
        });
      }

      const valid = errorCount === 0;
      const payload = {
        stateId: doc.id,
        valid,
        patched: options.patch !== undefined,
        errorCount,
        warningCount,
        machines: results,
      };

      emitStudioOutput(payload, options, () => {
        const lines: string[] = [];
        for (const m of results) {
          lines.push(`${m.valid ? 'PASS' : 'FAIL'} ${m.machineKey} (${m.sourceFile})`);
          for (const d of m.diagnostics) {
            const loc = d.targetId ? `${d.targetKind}:${d.targetId}` : d.targetKind;
            lines.push(`  [${d.code}/${d.severity}] (${loc}) ${d.message}`);
          }
        }
        lines.push(
          `studio validate (${doc.id}): ${valid ? 'PASS' : 'FAIL'} (${String(errorCount)} error(s), ${String(warningCount)} warning(s))`,
        );
        return lines.join('\n');
      });

      if (!valid) exitWith(1);
    },
  );

  // --- studio prompt [state-id] ---
  const promptCmd = studio
    .command('prompt')
    .description('Emit a structured Agent negotiation prompt for a Studio draft')
    .argument('[state-id]', 'studio draft state id (auto-selected when exactly one exists)')
    .option('--copy', 'also copy prompt text to system clipboard when available');
  addSpecDirOption(promptCmd);
  promptCmd.action(
    (stateIdArg: string | undefined, options: { copy?: boolean; directory?: string }) => {
      const rctx = reRootContext(ctx, options.directory);
      const io = makeNodeStudioStateIo(rctx.root);
      const stateId = resolveStateIdOrThrow(io, stateIdArg);
      const doc = readStudioState(io, stateId);

      const lines: string[] = [
        `# Studio Negotiation Prompt: ${doc.title}`,
        '',
        `- State ID: \`${doc.id}\``,
        `- Updated: ${doc.updatedAt}`,
        '',
        '## Machines & Semantic Diffs',
      ];

      for (const [machineKey, draft] of Object.entries(doc.machines)) {
        const diff = computeMachineDiff(draft);
        const summary = formatSemanticDiff(diff, draft);
        lines.push(
          '',
          `### \`${machineKey}\` (${draft.mode}, \`${draft.sourceFile}\`)`,
          '```diff',
          summary,
          '```',
        );
        if (draft.mode !== 'remove' && draft.current) {
          const diags = validateMachineGraph(draft.current);
          if (diags.length > 0) {
            lines.push('', 'Diagnostics:');
            for (const d of diags) {
              lines.push(`- [${d.code}/${d.severity}] ${d.message}`);
            }
          }
        }
      }

      const openComments = doc.comments.filter((c) => c.status === 'open');
      if (openComments.length > 0) {
        lines.push('', '## Open Comments');
        for (const c of openComments) {
          lines.push(`- \`${c.id}\` (${c.author}, ${formatAnchor(c.anchor)}): ${c.body}`);
        }
      }

      const pendingRevisions = doc.revisions.filter((r) => r.status === 'pending');
      if (pendingRevisions.length > 0) {
        lines.push('', '## Pending Revisions');
        for (const r of pendingRevisions) {
          lines.push(
            `- \`${r.id}\` (${r.machineKey}): ${r.rationale} (${String(r.ops.length)} op(s))`,
          );
        }
      }

      lines.push(
        '',
        '## CLI Callback Commands',
        `- Inspect full diff: \`llman-sdd studio diff ${doc.id}\``,
        `- Pre-validate a patch: \`llman-sdd studio validate ${doc.id} --patch -\``,
        `- Reply to a comment: \`llman-sdd studio comment reply ${doc.id} <comment-id> --body "<reply>"\``,
        `- Propose non-destructive revision: \`llman-sdd studio revise ${doc.id} --file <ops.json> --rationale "<why>"\``,
        `- Preview .feature sync: \`llman-sdd studio apply ${doc.id} --dry-run\``,
        '- Never edit `llmanspec/specs/` on the default branch; run `llman-sdd change start <id>` before `llman-sdd studio apply`.',
      );

      const promptText = lines.join('\n');
      console.log(promptText);

      if (options.copy === true) {
        const copied = tryCopyToClipboard(promptText);
        if (copied) {
          console.error('Copied prompt to clipboard.');
        } else {
          console.error('[WARNING] clipboard utility not available; prompt printed to stdout');
        }
      }
    },
  );

  // --- studio comment reply <state-id> <comment-id> ---
  const commentGroup = studio
    .command('comment')
    .description('Reply to anchored Studio draft comments');

  const commentReply = commentGroup
    .command('reply')
    .description('Append an Agent reply to an existing draft comment')
    .argument('<state-id>', 'studio draft state id')
    .argument('<comment-id>', 'target comment id')
    .requiredOption('--body <text>', 'reply message body')
    .option('--resolve', 'mark the target comment as resolved');
  addSpecDirOption(commentReply);
  commentReply.action(
    (
      stateIdArg: string,
      commentId: string,
      options: { body: string; resolve?: boolean; directory?: string },
    ) => {
      if (options.body.trim() === '') {
        throw new CliError('--body must not be empty', 2);
      }
      const rctx = reRootContext(ctx, options.directory);
      const io = makeNodeStudioStateIo(rctx.root);
      const stateId = validateStateId(stateIdArg);
      const doc = readStudioState(io, stateId);
      const nextDoc = replyStudioComment(doc, commentId, {
        author: 'agent',
        body: options.body,
        createdAt: io.now().toISOString(),
        resolve: options.resolve === true,
      });
      writeStudioState(io, nextDoc);
      const replyId = nextDoc.comments.at(-1)?.id ?? '';
      console.log(
        `Replied to ${commentId} as ${replyId}${options.resolve ? ' (resolved)' : ''} in studio state ${doc.id}`,
      );
    },
  );

  // --- studio revise <state-id> ---
  const reviseCmd = studio
    .command('revise')
    .description('Append a non-destructive Agent revision proposal from JSON stdin or --file')
    .argument('<state-id>', 'studio draft state id')
    .option(
      '--file <path>',
      'JSON file containing RevisionOp[] or { machineKey?, rationale?, ops }',
    )
    .option('--rationale <text>', 'rationale for the proposed revision')
    .option('--machine <key>', 'target machine key when input is a bare RevisionOp[] array');
  addSpecDirOption(reviseCmd);
  reviseCmd.action(
    (
      stateIdArg: string,
      options: { file?: string; rationale?: string; machine?: string; directory?: string },
    ) => {
      const rctx = reRootContext(ctx, options.directory);
      const io = makeNodeStudioStateIo(rctx.root);
      const stateId = validateStateId(stateIdArg);
      const doc = readStudioState(io, stateId);
      const rawText = readInputText(ctx.cwd, options.file);
      const { machineKey, ops, rationale } = parseRevisionPayload(
        rawText,
        doc,
        options.machine,
        options.rationale,
      );
      const nextDoc = proposeRevision(doc, {
        machineKey,
        rationale,
        ops,
        createdAt: io.now().toISOString(),
        source: 'agent',
      });
      writeStudioState(io, nextDoc);
      const revId = nextDoc.revisions.at(-1)?.id ?? '';
      console.log(
        `Proposed revision ${revId} for ${machineKey} (${String(ops.length)} op(s), status: pending) in studio state ${doc.id}`,
      );
    },
  );

  // --- studio apply <state-id> ---
  const applyCmd = studio
    .command('apply')
    .description('Semantically write validated Studio state machines back into llmanspec/specs/')
    .argument('<state-id>', 'studio draft state id')
    .option('--dry-run', 'preview Unified Diff to stdout on any branch without modifying files');
  addSpecDirOption(applyCmd);
  applyCmd.action((stateIdArg: string, options: { dryRun?: boolean; directory?: string }) => {
    const rctx = reRootContext(ctx, options.directory);
    const io = makeNodeStudioStateIo(rctx.root);
    const stateId = validateStateId(stateIdArg);
    const doc = readStudioState(io, stateId);

    // Step 1: Full E1-E4 gate across every non-removed machine
    const blockingLines: string[] = [];
    for (const [machineKey, draft] of Object.entries(doc.machines)) {
      if (draft.mode === 'remove') continue;
      if (!draft.current) {
        blockingLines.push(`- ${machineKey}: E1 structure: machine draft has no current graph`);
        continue;
      }
      const diags = validateMachineGraph(draft.current).filter((d) => d.severity === 'error');
      for (const d of diags) {
        const loc = d.targetId ? `${d.targetKind}:${d.targetId}` : d.targetKind;
        blockingLines.push(`- ${machineKey} [${d.code}] (${loc}): ${d.message}`);
      }
    }
    if (blockingLines.length > 0) {
      throw new CliError(
        `cannot apply studio state '${doc.id}': blocking graph diagnostics found:\n${blockingLines.join('\n')}`,
        1,
      );
    }

    // Step 2: Pure in-memory semantic rendering & Unified Diff preview
    let nextReqCounter: number | null = null;
    const allocateReqId = (): string => {
      if (nextReqCounter === null) {
        const specsDir = resolveRootSpecsDir(undefined, rctx.io);
        const first = nextReqId(rctx.io, specsDir);
        nextReqCounter = Math.trunc(Number(first.replace(/^r/u, '')));
      }
      const id = `r${String(nextReqCounter)}`;
      nextReqCounter += 1;
      return id;
    };

    const originalByFile = new Map<string, string | null>();
    const renderedByFile = new Map<string, string>();
    const allocatedIds: Array<{ machineKey: string; reqId: string }> = [];

    for (const [machineKey, rawDraft] of Object.entries(doc.machines)) {
      const diff = computeMachineDiff(rawDraft);
      if (!diff.hasChanges) continue;

      const draft = cloneMachineDraft(rawDraft);
      if (
        draft.mode === 'create' &&
        draft.current !== null &&
        (!draft.current.reqId || !/^r\d+$/u.test(draft.current.reqId.trim()))
      ) {
        const reqId = allocateReqId();
        draft.current.reqId = reqId;
        allocatedIds.push({ machineKey, reqId });
      }

      if (!originalByFile.has(draft.sourceFile)) {
        const orig = rctx.io.exists(draft.sourceFile) ? rctx.io.readText(draft.sourceFile) : null;
        originalByFile.set(draft.sourceFile, orig);
      }
      const baseText = renderedByFile.has(draft.sourceFile)
        ? renderedByFile.get(draft.sourceFile)!
        : originalByFile.get(draft.sourceFile)!;
      const updated = renderUpdatedFeatureSource(baseText, draft);
      renderedByFile.set(draft.sourceFile, updated);
    }

    const patches: Array<{ file: string; patch: string; nextText: string }> = [];
    for (const [file, nextText] of renderedByFile.entries()) {
      const beforeText = originalByFile.get(file) ?? null;
      const patch = previewFeatureUnifiedDiff(file, beforeText, nextText);
      patches.push({ file, patch, nextText });
    }

    // Step 3: --dry-run short-circuit (works on any branch, zero disk writes)
    if (options.dryRun === true) {
      if (patches.length === 0) {
        console.log(`No spec changes to apply for studio state ${doc.id}.`);
        return;
      }
      console.log(patches.map((p) => p.patch.trimEnd()).join('\n\n'));
      return;
    }

    // Step 4: Strict default-branch guard (exit 1, zero disk writes)
    assertNonDefaultBranch(rctx.git);

    if (patches.length === 0) {
      console.log(`No spec changes to apply for studio state ${doc.id}.`);
      return;
    }

    // Write rendered .feature files directly on the bound feature branch
    for (const p of patches) {
      rctx.io.writeText(p.file, p.nextText);
    }

    console.log(`Applied studio state '${doc.id}' to ${String(patches.length)} file(s):`);
    for (const p of patches) {
      console.log(`  - ${p.file}`);
    }
    for (const a of allocatedIds) {
      console.log(`  allocated @req:${a.reqId} for ${a.machineKey}`);
    }
    console.log("Next: run 'llman-sdd validate' and commit the updated specs.");
  });

  // --- studio mcp ---
  registerStudioMcp(studio, ctx);
}
