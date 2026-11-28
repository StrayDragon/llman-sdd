/**
 * Pure frontend helpers for Studio Web「逻辑漂移校准」(studio-web r151):
 * - Computes 1:1 canvas overlay (added ghost states + dashed green edges) for pending `drift-trace` proposals
 * - Builds structured, zero-blind-copy「真理胜出」Prompt text with Trace evidence & object anchors
 */
import {
  applyRevisionOpsToMachine,
  type StudioMachineIR,
  type StudioRevisionProposal,
  type StudioStateNode,
  type StudioTransitionEdge,
} from '@llman-sdd/core/studio';

export interface DriftCalibrationOverlay {
  proposalIds: string[];
  shadowEdgeCount: number;
  addedStates: StudioStateNode[];
  addedEdges: StudioTransitionEdge[];
  evidenceLines: string[];
}

export function getPendingDriftProposals(
  revisions: readonly StudioRevisionProposal[],
  machineKey?: string | null,
): StudioRevisionProposal[] {
  return revisions.filter(
    (r) =>
      r.status === 'pending' &&
      r.source === 'drift-trace' &&
      (machineKey === undefined || machineKey === null || r.machineKey === machineKey),
  );
}

export function countShadowEdgesInProposals(proposals: readonly StudioRevisionProposal[]): number {
  let count = 0;
  for (const p of proposals) {
    for (const op of p.ops) {
      if (op.op === 'add_transition') count += 1;
    }
  }
  return count;
}

export function computeDriftCalibrationOverlay(
  machine: StudioMachineIR,
  pendingDriftProposals: readonly StudioRevisionProposal[],
): DriftCalibrationOverlay | null {
  const matched = pendingDriftProposals.filter(
    (p) =>
      p.status === 'pending' && p.source === 'drift-trace' && p.machineKey === machine.machineKey,
  );
  if (matched.length === 0) return null;

  const allOps = matched.flatMap((p) => p.ops);
  let projected: StudioMachineIR;
  try {
    projected = applyRevisionOpsToMachine(machine, allOps);
  } catch {
    return null;
  }

  const baseStateUids = new Set(machine.states.map((s) => s.uid));
  const baseEdgeUids = new Set(machine.transitions.map((t) => t.uid));

  const addedStates = projected.states.filter((s) => !baseStateUids.has(s.uid));
  const addedEdges = projected.transitions.filter((t) => !baseEdgeUids.has(t.uid));

  return {
    proposalIds: matched.map((p) => p.id),
    shadowEdgeCount: addedEdges.length,
    addedStates,
    addedEdges,
    evidenceLines: matched.map((p) => `[${p.id}] ${p.rationale}`),
  };
}

export interface TruthWinsPromptInput {
  repo: string;
  branch: string;
  wsKey: string;
  stateId: string;
  machineKey: string;
  sourceFile: string;
  proposals: readonly StudioRevisionProposal[];
}

/**
 * Build the zero-blind-copy Prompt for 「真理胜出（修代码）」 so the coding Agent removes
 * undeclared shadow transitions from code without altering llmanspec/specs/.
 */
export function buildTruthWinsPrompt(input: TruthWinsPromptInput): string {
  const edgeLines: string[] = [];
  for (const p of input.proposals) {
    edgeLines.push(`- 建议 \`${p.id}\`：${p.rationale}`);
    for (const op of p.ops) {
      if (op.op === 'add_transition') {
        const g = op.guard ? ` [${op.guard}]` : '';
        edgeLines.push(`  - 违规后门转移：\`${op.from} --[${op.event}${g}]--> ${op.to}\``);
      }
    }
  }

  return [
    `# 逻辑漂移校准 · 真理胜出（修复违规实现代码）`,
    '',
    `- 仓库与分支：\`${input.repo}\` (\`${input.branch}\`)`,
    `- 工作区：\`${input.wsKey}\``,
    `- 草稿 ID：\`${input.stateId}\``,
    `- 精确规格锚点：\`machine:${input.machineKey}\` (\`${input.sourceFile}\`)`,
    '',
    '## 1. Runtime Trace 观测到的未登记转移证据',
    edgeLines.length > 0 ? edgeLines.join('\n') : '- 存在待清理的未登记状态转移。',
    '',
    '## 2. 团队裁决结论：真理胜出（不得修改规格）',
    `1. \`${input.sourceFile}\` 中的状态流转表为唯一真理，不得静默改写 \`llmanspec/specs/\`；`,
    '2. 请定位并修正产生上述未登记状态/转移的实现代码（含绕过守卫或未登记热修分支）；',
    '3. 修复后重跑 `llman-sdd studio drift --trace <trace.jsonl> --fail-on-shadow`，确认退出码为 0 且全量测试变绿；',
    `4. 如有补充说明，可通过 \`llman-sdd studio comment reply ${input.stateId} <comment-id> --body "<说明>"\` 回写。`,
  ].join('\n');
}
