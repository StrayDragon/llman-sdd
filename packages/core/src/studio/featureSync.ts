/**
 * Lossless .feature transition-table rendering, proposal.md assembly, and in-memory Unified Diff
 * preview via jsdiff (studio-core r133). Pure — zero filesystem I/O.
 */
import { createTwoFilesPatch } from 'diff';

import { computeMachineDiff, formatSemanticDiff } from './diff.ts';
import type { MachineDraft, StudioComment, StudioMachineIR } from './model.ts';

export class StudioSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudioSyncError';
  }
}

const RULE_HEADER_RE = /^(\s*)(?:规则|Rule)\s*:\s*(.+?)\s*$/u;
const SCENARIO_HEADER_RE =
  /^(\s*)(?:场景大纲|场景模板|场景|Scenario Outline|Scenario Template|Scenario)\s*:\s*(.+?)\s*$/u;
const EXAMPLES_HEADER_RE = /^(\s*)(?:例子|Examples|Scenarios)\s*:\s*.*$/u;

function formatTableLines(machine: StudioMachineIR, indent: string): string[] {
  const stateNameByUid = new Map(machine.states.map((s) => [s.uid, s.name]));
  const nameOf = (uid: string): string => stateNameByUid.get(uid) ?? uid;

  const hasGuardCol =
    machine.columns.guard !== undefined ||
    machine.transitions.some((t) => t.guard !== undefined && t.guard.trim() !== '');
  const guardColName =
    machine.columns.guard ?? (machine.columns.from === 'from' ? 'guard' : '守卫');

  const headers = hasGuardCol
    ? [machine.columns.from, machine.columns.event, guardColName, machine.columns.to]
    : [machine.columns.from, machine.columns.event, machine.columns.to];

  const orderedTransitions =
    machine.initialStateUid !== null &&
    machine.transitions.length > 1 &&
    machine.transitions[0]?.fromUid !== machine.initialStateUid
      ? (() => {
          const idx = machine.transitions.findIndex((t) => t.fromUid === machine.initialStateUid);
          if (idx <= 0) return machine.transitions;
          const first = machine.transitions[idx];
          if (!first) return machine.transitions;
          return [
            first,
            ...machine.transitions.slice(0, idx),
            ...machine.transitions.slice(idx + 1),
          ];
        })()
      : machine.transitions;

  const rows: string[][] = orderedTransitions.map((t) =>
    hasGuardCol
      ? [nameOf(t.fromUid), t.event, t.guard ?? '', nameOf(t.toUid)]
      : [nameOf(t.fromUid), t.event, nameOf(t.toUid)],
  );

  const allRows = [headers, ...rows];
  const widths = headers.map((_, colIdx) =>
    Math.max(...allRows.map((row) => (row[colIdx] ?? '').length)),
  );

  return allRows.map((row) => {
    const cells = row.map((cell, idx) => cell.padEnd(widths[idx] ?? 0, ' '));
    return `${indent}| ${cells.join(' | ')} |`;
  });
}

function buildScenarioOutlineBlock(machine: StudioMachineIR, indent = '    '): string[] {
  const hasGuardCol =
    machine.columns.guard !== undefined ||
    machine.transitions.some((t) => t.guard !== undefined && t.guard.trim() !== '');
  const guardColName =
    machine.columns.guard ?? (machine.columns.from === 'from' ? 'guard' : '守卫');
  const stepIndent = `${indent}  `;
  const tableIndent = `${indent}    `;

  const givenLine = hasGuardCol
    ? `${stepIndent}假如 当前处于 <${machine.columns.from}> 状态且满足 <${guardColName}>`
    : `${stepIndent}假如 当前处于 <${machine.columns.from}> 状态`;

  return [
    `${indent}@transitions`,
    `${indent}场景大纲: ${machine.scenarioName}`,
    givenLine,
    `${stepIndent}当 触发 <${machine.columns.event}> 事件`,
    `${stepIndent}那么 流转至 <${machine.columns.to}> 状态`,
    '',
    `${stepIndent}例子:`,
    ...formatTableLines(machine, tableIndent),
  ];
}

function buildRuleBlock(machine: StudioMachineIR): string[] {
  const reqTag = machine.reqId && machine.reqId.trim() !== '' ? machine.reqId.trim() : 'rTODO';
  return [
    `  @req:${reqTag}`,
    `  规则: ${machine.ruleTitle}`,
    `    ${machine.ruleTitle} MUST 遵循状态流转表约束并通过 E1–E4 图校验。`,
    '',
    ...buildScenarioOutlineBlock(machine, '    '),
  ];
}

interface ScenarioSpan {
  ruleStartIdx: number;
  ruleEndIdx: number;
  scenarioStartIdx: number;
  scenarioEndIdx: number;
  examplesHeaderIdx: number;
  tableStartIdx: number;
  tableEndIdx: number;
  tableIndent: string;
  otherScenariosInRule: number;
}

function locateScenarioSpan(
  lines: readonly string[],
  target: Pick<StudioMachineIR, 'reqId' | 'ruleTitle' | 'scenarioName'>,
): ScenarioSpan | null {
  interface RuleRange {
    startIdx: number;
    endIdx: number;
    reqId: string | null;
    title: string;
  }

  const ruleRanges: RuleRange[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = RULE_HEADER_RE.exec(lines[i] ?? '');
    if (!m) continue;
    // Look up contiguous tag lines immediately above `规则:`
    let startIdx = i;
    let reqId: string | null = null;
    for (let j = i - 1; j >= 0; j -= 1) {
      const trimmed = (lines[j] ?? '').trim();
      if (trimmed.startsWith('@')) {
        startIdx = j;
        const rm = /@req:([^\s]+)/u.exec(trimmed);
        if (rm?.[1]) reqId = rm[1];
      } else {
        break;
      }
    }
    const prev = ruleRanges.at(-1);
    if (prev) prev.endIdx = startIdx;
    ruleRanges.push({ startIdx, endIdx: lines.length, reqId, title: (m[2] ?? '').trim() });
  }

  for (const rr of ruleRanges) {
    const ruleMatches =
      (target.reqId !== null && target.reqId !== '' && rr.reqId === target.reqId) ||
      rr.title === target.ruleTitle.trim();
    if (!ruleMatches) continue;

    // Collect scenario boundaries inside this rule range
    const scStarts: Array<{ startIdx: number; headerIdx: number; name: string }> = [];
    for (let i = rr.startIdx; i < rr.endIdx; i += 1) {
      const sm = SCENARIO_HEADER_RE.exec(lines[i] ?? '');
      if (!sm) continue;
      let startIdx = i;
      for (let j = i - 1; j >= rr.startIdx; j -= 1) {
        if ((lines[j] ?? '').trim().startsWith('@')) startIdx = j;
        else break;
      }
      scStarts.push({ startIdx, headerIdx: i, name: (sm[2] ?? '').trim() });
    }

    const matchIdx = scStarts.findIndex((s) => s.name === target.scenarioName.trim());
    if (matchIdx === -1) continue;

    const hit = scStarts[matchIdx];
    if (!hit) continue;
    const scenarioEndIdx = scStarts[matchIdx + 1]?.startIdx ?? rr.endIdx;

    let examplesHeaderIdx = -1;
    for (let i = hit.headerIdx + 1; i < scenarioEndIdx; i += 1) {
      if (EXAMPLES_HEADER_RE.test(lines[i] ?? '')) {
        examplesHeaderIdx = i;
        break;
      }
    }
    if (examplesHeaderIdx === -1) return null;

    let tableStartIdx = -1;
    let tableEndIdx = -1;
    let tableIndent = '        ';
    for (let i = examplesHeaderIdx + 1; i < scenarioEndIdx; i += 1) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();
      if (trimmed.startsWith('|')) {
        if (tableStartIdx === -1) {
          tableStartIdx = i;
          tableIndent = /^(\s*)/u.exec(line)?.[1] ?? '        ';
        }
        tableEndIdx = i + 1;
      } else if (tableStartIdx !== -1) {
        break;
      }
    }
    if (tableStartIdx === -1 || tableEndIdx === -1) return null;

    return {
      ruleStartIdx: rr.startIdx,
      ruleEndIdx: rr.endIdx,
      scenarioStartIdx: hit.startIdx,
      scenarioEndIdx,
      examplesHeaderIdx,
      tableStartIdx,
      tableEndIdx,
      tableIndent,
      otherScenariosInRule: scStarts.length - 1,
    };
  }

  return null;
}

/**
 * Losslessly render updated `.feature` source for `modify`, `create`, or `remove` drafts.
 * Semantically locates the target `例子:` block — immune to line-number drift above or below.
 */
export function renderUpdatedFeatureSource(
  originalText: string | null,
  draft: MachineDraft,
): string {
  if (draft.mode === 'create') {
    const machine = draft.current;
    if (!machine) throw new StudioSyncError('create draft has no current machine IR');
    if (originalText === null || originalText.trim() === '') {
      const out = [
        '# language: zh-CN',
        `# purpose: 定义 ${machine.capability} 能力的状态流转与行为合约。`,
        '',
        `功能: ${machine.capability}`,
        '',
        ...buildRuleBlock(machine),
      ];
      return `${out.join('\n')}\n`;
    }
    const baseTrimmed = originalText.replace(/\s+$/u, '');
    return `${baseTrimmed}\n\n${buildRuleBlock(machine).join('\n')}\n`;
  }

  if (originalText === null) {
    throw new StudioSyncError(`source file does not exist for ${draft.mode}: ${draft.sourceFile}`);
  }

  const trailingNewline = originalText.endsWith('\n');
  const rawLines = (trailingNewline ? originalText.slice(0, -1) : originalText).split('\n');

  if (draft.mode === 'remove') {
    const target = draft.baseline;
    if (!target) throw new StudioSyncError('remove draft has no baseline machine IR');
    const span = locateScenarioSpan(rawLines, target);
    if (!span) {
      throw new StudioSyncError(
        `target transition scenario not found for removal: ${target.scenarioName} in ${draft.sourceFile}`,
      );
    }
    const removeFrom = span.otherScenariosInRule === 0 ? span.ruleStartIdx : span.scenarioStartIdx;
    const removeTo = span.otherScenariosInRule === 0 ? span.ruleEndIdx : span.scenarioEndIdx;
    const nextLines = [...rawLines.slice(0, removeFrom), ...rawLines.slice(removeTo)];
    const cleaned = nextLines
      .join('\n')
      .replaceAll(/\n{3,}/gu, '\n\n')
      .trimEnd();
    return `${cleaned}\n`;
  }

  const machine = draft.current;
  if (!machine) throw new StudioSyncError('modify draft has no current machine IR');
  const locatorTarget = draft.baseline ?? machine;
  const span = locateScenarioSpan(rawLines, locatorTarget);
  if (!span) {
    throw new StudioSyncError(
      `target transition scenario not found: ${locatorTarget.scenarioName} in ${draft.sourceFile}`,
    );
  }

  const newTable = formatTableLines(machine, span.tableIndent);
  const nextLines = [
    ...rawLines.slice(0, span.tableStartIdx),
    ...newTable,
    ...rawLines.slice(span.tableEndIdx),
  ];
  return `${nextLines.join('\n')}${trailingNewline ? '\n' : ''}`;
}

/** Generate in-memory standard Unified Diff preview via jsdiff (zero patch files written). */
export function previewFeatureUnifiedDiff(
  filePath: string,
  beforeText: string | null,
  afterText: string,
): string {
  const oldLabel = beforeText === null ? '/dev/null' : `a/${filePath}`;
  const newLabel = `b/${filePath}`;
  return createTwoFilesPatch(oldLabel, newLabel, beforeText ?? '', afterText, '', '', {
    context: 3,
  });
}

export interface BuildProposalDraftInput {
  title: string;
  why: string;
  drafts: readonly MachineDraft[];
  comments?: readonly StudioComment[];
  dependsOn?: readonly string[];
}

/** Assemble a compliant `llmanspec/changes/<id>/proposal.md` document from Studio drafts. */
export function buildProposalDraft(input: BuildProposalDraftInput): string {
  const title = input.title.trim();
  if (title === '') throw new StudioSyncError('proposal title must not be empty');
  const deps = input.dependsOn ?? [];
  const depsYaml =
    deps.length === 0 ? 'depends_on: []' : `depends_on:\n${deps.map((d) => `  - ${d}`).join('\n')}`;

  const capabilities = new Set<string>();
  const diffSections: string[] = [];

  for (const draft of input.drafts) {
    const cap = draft.current?.capability ?? draft.baseline?.capability;
    if (cap) capabilities.add(cap);
    const diff = computeMachineDiff(draft);
    const key = draft.current?.machineKey ?? draft.baseline?.machineKey ?? draft.sourceFile;
    diffSections.push(
      `- **\`${key}\`** (${draft.mode}):\n\n\`\`\`diff\n${formatSemanticDiff(diff, draft)}\n\`\`\``,
    );
  }

  const commentLines = (input.comments ?? []).map((c) => `- [${c.author}/${c.status}] ${c.body}`);

  const sections = [
    '---',
    depsYaml,
    `title: ${title}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Why',
    '',
    input.why.trim(),
    '',
    '## What Changes',
    '',
    ...(diffSections.length > 0 ? diffSections : ['- (no semantic state machine diffs)']),
  ];

  if (commentLines.length > 0) {
    sections.push('', '### Key Discussion Notes', '', ...commentLines);
  }

  sections.push(
    '',
    '## Capabilities',
    '',
    ...[...capabilities].toSorted().map((c) => `- \`${c}\``),
    '',
    '## Impact',
    '',
    '- Generated from Studio local draft; bind a change branch via `llman-sdd change start <id>` and run `llman-sdd studio apply` to land specs safely.',
    '',
  );

  return sections.join('\n');
}
