import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  STUDIO_STATES_REL,
  addStudioComment,
  cloneMachineIR,
  createMachineDraft,
  createStudioStateDoc,
  extractStudioMachines,
  listStudioStates,
  parseCapability,
  readStudioState,
  writeStudioState,
  type SpecEntry,
  type StudioStateDoc,
} from '@llman-sdd/core';

import { makeNodeStudioStateIo } from '../../apps/cli/src/commands/studio.ts';
import { CLI, initGitRepo } from '../helpers/spawn.ts';

function runCliIn(
  args: string[],
  cwd: string,
  input?: string,
): { code: number; stdout: string; stderr: string } {
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env,
    input,
  });
  return {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  };
}

const SAMPLE_EXPENSE_FEATURE = `# language: zh-CN
# purpose: 定义 expense 能力的状态流转与行为合约。

功能: expense

  @req:r10
  规则: 报销状态流转
    报销单 MUST 按审批流转表推进状态。

    # 核心业务注释必须保留
    @transitions
    场景大纲: 报销主流程
      假如 当前处于 <初始状态> 状态且满足 <守卫>
      当 触发 <事件> 事件
      那么 流转至 <目标状态> 状态

      例子:
        | 初始状态 | 事件 | 守卫 | 目标状态 |
        | 草稿 | 提交 |  | 待审批 |
        | 待审批 | 批准 | 金额<=5000 | 已通过 |
        | 待审批 | 驳回 |  | 已驳回 |
`;

function makeStudioTempRepo(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-studio-cli-'));
  initGitRepo(root, 'main');
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: zh-Hans\n');
  writeFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), SAMPLE_EXPENSE_FEATURE);
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'init studio repo'], { cwd: root });
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function seedExpenseDraft(
  root: string,
  id: string,
  opts: { withComment?: boolean; withCreateDraft?: boolean; brokenE3?: boolean } = {},
): StudioStateDoc {
  const entry: SpecEntry = {
    fileName: 'llmanspec/specs/expense.feature',
    specId: 'expense',
    doc: parseCapability(SAMPLE_EXPENSE_FEATURE, 'llmanspec/specs/expense.feature'),
  };
  const extracted = extractStudioMachines([entry])[0]!;
  const draft = extracted.draft;
  // Modify draft: rename 待审批 -> 主管审批 and add an extra transition
  draft.current!.states[1]!.name = '主管审批';
  if (opts.brokenE3) {
    draft.current!.states.push({ uid: 's99', name: '孤岛状态' });
  }
  const drafts = [draft];
  if (opts.withCreateDraft) {
    drafts.push(
      createMachineDraft({
        capability: 'refund',
        ruleTitle: '退款状态流转',
        scenarioName: '退款主流程',
        reqId: null,
        states: [{ name: '申请中', initial: true }, { name: '已退款' }],
        transitions: [{ from: '申请中', event: '放款', to: '已退款' }],
      }),
    );
  }
  let doc = createStudioStateDoc({
    id,
    title: `Draft ${id}`,
    createdAt: '2026-11-26T12:00:00Z',
    drafts,
  });
  if (opts.withComment) {
    const key = draft.current!.machineKey;
    doc = addStudioComment(doc, {
      anchor: { kind: 'state', machineKey: key, stateUid: 's2' },
      author: 'human',
      body: '是否需要为大额报销增加 CFO 复核节点？',
      createdAt: '2026-11-26T12:01:00Z',
    });
  }
  const io = makeNodeStudioStateIo(root);
  writeStudioState(io, doc);
  return doc;
}

test('T1: makeNodeStudioStateIo is read-lazy and writes atomically without stray tmp files', () => {
  const repo = makeStudioTempRepo();
  try {
    const io = makeNodeStudioStateIo(repo.root);
    const statesDir = join(repo.root, STUDIO_STATES_REL);
    expect(existsSync(statesDir)).toBe(false);
    expect(listStudioStates(io)).toEqual([]);
    // Read-only list must NOT create .llman-sdd/studio/states/
    expect(existsSync(statesDir)).toBe(false);

    seedExpenseDraft(repo.root, 'alpha-draft');
    expect(existsSync(statesDir)).toBe(true);
    const entries = readdirSync(statesDir);
    expect(entries).toEqual(['alpha-draft.json']);
  } finally {
    repo.cleanup();
  }
});

test('T1: bare studio, studio state, studio comment exit 2 with Usage; state list/prune & disambiguation', () => {
  const repo = makeStudioTempRepo();
  const outside = mkdtempSync(join(tmpdir(), 'llman-sdd-studio-outside-'));
  try {
    for (const bareArgs of [['studio'], ['studio', 'state'], ['studio', 'comment']]) {
      const bare = runCliIn(bareArgs, repo.root);
      expect(bare.code).toBe(2);
      expect(bare.stderr).toContain('Usage:');
      expect(bare.stderr).not.toContain('Error: error:');
      expect(bare.stderr).not.toMatch(/(?:^|\n)Error:\s*$/mu);
    }

    // 0 drafts -> omitting state-id exits 1 without creating directory
    const emptyDiff = runCliIn(['studio', 'diff'], repo.root);
    expect(emptyDiff.code).toBe(1);
    expect(emptyDiff.stderr).toContain('Error:');
    expect(emptyDiff.stderr).toContain('Next:');
    expect(existsSync(join(repo.root, STUDIO_STATES_REL))).toBe(false);

    const emptyValidate = runCliIn(['studio', 'validate'], repo.root);
    expect(emptyValidate.code).toBe(0);
    expect(emptyValidate.stdout).toContain('source: specs');
    expect(existsSync(join(repo.root, STUDIO_STATES_REL))).toBe(false);

    // Seed 2 drafts
    seedExpenseDraft(repo.root, 'draft-a');
    seedExpenseDraft(repo.root, 'draft-b');

    // state list --json / --compact-json / --directory from outside repo
    const listPretty = runCliIn(['studio', 'state', 'list', '--json'], repo.root);
    expect(listPretty.code).toBe(0);
    const parsedPretty = JSON.parse(listPretty.stdout) as { states: Array<{ id: string }> };
    expect(parsedPretty.states.map((s) => s.id)).toEqual(['draft-a', 'draft-b']);

    const listCompact = runCliIn(
      ['studio', 'state', 'list', '--compact-json', '--directory', repo.root],
      outside,
    );
    expect(listCompact.code).toBe(0);
    expect(listCompact.stdout.trim().includes('\n')).toBe(false);
    expect(JSON.parse(listCompact.stdout)).toEqual(parsedPretty);

    // Multi-draft disambiguation error lists all IDs and exits 1
    const ambiguous = runCliIn(['studio', 'diff'], repo.root);
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.stderr).toContain('draft-a');
    expect(ambiguous.stderr).toContain('draft-b');

    // state prune invalid flag combinations exit 2
    expect(runCliIn(['studio', 'state', 'prune'], repo.root).code).toBe(2);
    expect(runCliIn(['studio', 'state', 'prune', '--id', 'draft-a', '--all'], repo.root).code).toBe(
      2,
    );

    // Prune single draft -> remaining 1 draft auto-selected when omitted
    const pruneOne = runCliIn(['studio', 'state', 'prune', '--id', 'draft-b'], repo.root);
    expect(pruneOne.code).toBe(0);
    const autoDiff = runCliIn(['studio', 'diff', '--json'], repo.root);
    expect(autoDiff.code).toBe(0);
    expect((JSON.parse(autoDiff.stdout) as { stateId: string }).stateId).toBe('draft-a');

    // Prune --all removes remaining draft
    const pruneAll = runCliIn(['studio', 'state', 'prune', '--all'], repo.root);
    expect(pruneAll.code).toBe(0);
    const listAfter = runCliIn(['studio', 'state', 'list', '--json'], repo.root);
    expect((JSON.parse(listAfter.stdout) as { states: unknown[] }).states).toEqual([]);
  } finally {
    repo.cleanup();
    rmSync(outside, { recursive: true, force: true });
  }
});

test('T2: studio diff, studio validate (--patch stdin without mutating disk), and studio prompt', () => {
  const repo = makeStudioTempRepo();
  try {
    seedExpenseDraft(repo.root, 'negotiate-1', { withComment: true, brokenE3: true });
    const statePath = join(repo.root, STUDIO_STATES_REL, 'negotiate-1.json');
    const beforeDisk = readFileSync(statePath, 'utf8');

    // studio diff human + --no-unified + --json
    const diffHuman = runCliIn(['studio', 'diff', 'negotiate-1'], repo.root);
    expect(diffHuman.code).toBe(0);
    expect(diffHuman.stdout).toContain('~ rename state: 待审批 -> 主管审批');
    expect(diffHuman.stdout).toContain('CFO 复核节点');
    expect(diffHuman.stdout).toContain('+++ b/llmanspec/specs/expense.feature');

    const diffNoUnified = runCliIn(
      ['studio', 'diff', 'negotiate-1', '--no-unified', '--json'],
      repo.root,
    );
    expect(diffNoUnified.code).toBe(0);
    const diffJson = JSON.parse(diffNoUnified.stdout) as {
      machines: Array<{ unifiedDiff?: string }>;
      openComments: Array<{ id: string }>;
    };
    expect(diffJson.machines[0]?.unifiedDiff).toBeUndefined();
    expect(diffJson.openComments.length).toBe(1);

    // studio validate without patch -> fails E3 (exit 1)
    const valFail = runCliIn(['studio', 'validate', 'negotiate-1', '--json'], repo.root);
    expect(valFail.code).toBe(1);
    const valFailJson = JSON.parse(valFail.stdout) as { valid: boolean; errorCount: number };
    expect(valFailJson.valid).toBe(false);
    expect(valFailJson.errorCount).toBeGreaterThan(0);

    // studio validate --patch - removes orphan state -> passes (exit 0) without touching disk!
    const fixPatch = JSON.stringify([{ op: 'remove_state', stateName: '孤岛状态' }]);
    const valPatched = runCliIn(
      ['studio', 'validate', 'negotiate-1', '--patch', '-', '--compact-json'],
      repo.root,
      fixPatch,
    );
    expect(valPatched.code).toBe(0);
    const valPatchedJson = JSON.parse(valPatched.stdout) as { valid: boolean; patched: boolean };
    expect(valPatchedJson.valid).toBe(true);
    expect(valPatchedJson.patched).toBe(true);
    expect(readFileSync(statePath, 'utf8')).toBe(beforeDisk);

    // studio prompt outputs structured negotiation prompt
    const promptRes = runCliIn(['studio', 'prompt', 'negotiate-1'], repo.root);
    expect(promptRes.code).toBe(0);
    expect(promptRes.stdout).toContain('negotiate-1');
    expect(promptRes.stdout).toContain('llman-sdd studio comment reply negotiate-1');
    expect(promptRes.stdout).toContain('llman-sdd studio revise negotiate-1');
  } finally {
    repo.cleanup();
  }
});

test('T3: studio comment reply (--resolve) and studio revise (--file / stdin) leave human draft untouched', () => {
  const repo = makeStudioTempRepo();
  try {
    const seeded = seedExpenseDraft(repo.root, 'collab-1', { withComment: true });
    const machineKey = Object.keys(seeded.machines)[0]!;
    const beforeCurrentJson = JSON.stringify(seeded.machines[machineKey]!.current);

    // Missing --body -> exit 2
    expect(runCliIn(['studio', 'comment', 'reply', 'collab-1', 'c1'], repo.root).code).toBe(2);

    // Valid reply with --resolve
    const replyRes = runCliIn(
      [
        'studio',
        'comment',
        'reply',
        'collab-1',
        'c1',
        '--body',
        '已确认，建议增加 CFO 审批节点。',
        '--resolve',
      ],
      repo.root,
    );
    expect(replyRes.code).toBe(0);

    const io = makeNodeStudioStateIo(repo.root);
    const afterReply = readStudioState(io, 'collab-1');
    expect(afterReply.comments.find((c) => c.id === 'c1')?.status).toBe('resolved');
    expect(afterReply.comments.some((c) => c.replyTo === 'c1' && c.author === 'agent')).toBe(true);

    // studio revise via --file
    const patchFile = join(repo.root, 'agent-ops.json');
    writeFileSync(
      patchFile,
      JSON.stringify([
        { op: 'add_state', name: 'CFO复核' },
        {
          op: 'add_transition',
          from: '主管审批',
          event: '大额升级',
          guard: '金额>5000',
          to: 'CFO复核',
        },
        { op: 'add_transition', from: 'CFO复核', event: '终审通过', to: '已通过' },
      ]),
    );
    const reviseFile = runCliIn(
      ['studio', 'revise', 'collab-1', '--file', patchFile, '--rationale', '补充大额 CFO 复核路径'],
      repo.root,
    );
    expect(reviseFile.code).toBe(0);

    // studio revise via stdin
    const reviseStdin = runCliIn(
      ['studio', 'revise', 'collab-1', '--rationale', 'stdin 追加状态'],
      repo.root,
      JSON.stringify([{ op: 'add_state', name: '财务归档' }]),
    );
    expect(reviseStdin.code).toBe(0);

    // Verify human draft was NEVER mutated; only pending revisions appended
    const afterRevise = readStudioState(io, 'collab-1');
    expect(JSON.stringify(afterRevise.machines[machineKey]!.current)).toBe(beforeCurrentJson);
    expect(afterRevise.revisions.length).toBe(2);
    expect(afterRevise.revisions.every((r) => r.status === 'pending')).toBe(true);

    // Invalid JSON / unsupported op -> exit 2
    expect(runCliIn(['studio', 'revise', 'collab-1'], repo.root, '{bad json').code).toBe(2);
    expect(
      runCliIn(['studio', 'revise', 'collab-1'], repo.root, JSON.stringify([{ op: 'unknown_op' }]))
        .code,
    ).toBe(2);
  } finally {
    repo.cleanup();
  }
});

test('T4: studio apply blocks on E1-E4, blocks on main, allows --dry-run on main, and survives 20-line drift + create reqId on feature branch', () => {
  const repo = makeStudioTempRepo();
  try {
    // 1) Blocking E3 error rejected even on --dry-run
    seedExpenseDraft(repo.root, 'broken-draft', { brokenE3: true });
    const blocked = runCliIn(['studio', 'apply', 'broken-draft', '--dry-run'], repo.root);
    expect(blocked.code).toBe(1);
    expect(blocked.stderr).toContain('E3');

    // 2) Valid draft with both modify + create (reqId: null)
    seedExpenseDraft(repo.root, 'ready-draft', { withCreateDraft: true });
    const expensePath = join(repo.root, 'llmanspec', 'specs', 'expense.feature');
    const refundPath = join(repo.root, 'llmanspec', 'specs', 'refund.feature');
    const originalExpense = readFileSync(expensePath, 'utf8');

    // On main: direct apply MUST be rejected with exit 1 and zero file writes
    const applyMain = runCliIn(['studio', 'apply', 'ready-draft'], repo.root);
    expect(applyMain.code).toBe(1);
    expect(applyMain.stderr).toContain("default branch 'main'");
    expect(applyMain.stderr).toContain('change start');
    expect(readFileSync(expensePath, 'utf8')).toBe(originalExpense);
    expect(existsSync(refundPath)).toBe(false);

    // On main: --dry-run succeeds (exit 0) and prints Unified Diff with zero file writes
    const dryRunMain = runCliIn(['studio', 'apply', 'ready-draft', '--dry-run'], repo.root);
    expect(dryRunMain.code).toBe(0);
    expect(dryRunMain.stdout).toContain('+++ b/llmanspec/specs/expense.feature');
    expect(dryRunMain.stdout).toContain('+++ b/llmanspec/specs/refund.feature');
    expect(dryRunMain.stdout).toContain('@req:r11');
    expect(readFileSync(expensePath, 'utf8')).toBe(originalExpense);
    expect(existsSync(refundPath)).toBe(false);

    // Switch to a feature branch via git checkout -b sdd/expense-update
    spawnSync('git', ['checkout', '-qb', 'sdd/expense-update'], { cwd: repo.root });

    // Insert 20+ lines of another rule ABOVE @req:r10 to shift all line numbers!
    const insertedBlock = [
      '  @req:r9',
      '  规则: 报销前校验规则',
      '    系统 MUST 校验基础字段。',
      '    附加说明行 1',
      '    附加说明行 2',
      '    附加说明行 3',
      '    附加说明行 4',
      '    附加说明行 5',
      '    附加说明行 6',
      '    附加说明行 7',
      '    附加说明行 8',
      '    附加说明行 9',
      '    附加说明行 10',
      '',
      '    场景: 基础字段校验通过',
      '      假如 员工填写合法报销单',
      '      当 提交校验',
      '      那么 校验通过',
      '      而且 记录审计日志',
      '',
    ].join('\n');
    const driftedExpense = originalExpense.replace('  @req:r10', `${insertedBlock}\n  @req:r10`);
    expect(
      driftedExpense.split('\n').length - originalExpense.split('\n').length,
    ).toBeGreaterThanOrEqual(20);
    writeFileSync(expensePath, driftedExpense);

    // Run studio apply on feature branch
    const applyFeat = runCliIn(['studio', 'apply', 'ready-draft'], repo.root);
    expect(applyFeat.code).toBe(0);
    expect(applyFeat.stdout).toContain('llmanspec/specs/expense.feature');
    expect(applyFeat.stdout).toContain('llmanspec/specs/refund.feature');

    const updatedExpense = readFileSync(expensePath, 'utf8');
    expect(updatedExpense).toContain('规则: 报销前校验规则');
    expect(updatedExpense).toContain('# 核心业务注释必须保留');
    expect(updatedExpense).toContain('主管审批');
    expect(updatedExpense).not.toContain('待审批');

    const createdRefund = readFileSync(refundPath, 'utf8');
    expect(createdRefund).toContain('@req:r11');
    expect(createdRefund).not.toContain('rTODO');
    expect(createdRefund).toContain('功能: refund');

    // Full round-trip: `llman-sdd validate --specs --strict` passes!
    const validateRes = runCliIn(['validate', '--specs', '--strict'], repo.root);
    expect(validateRes.code).toBe(0);
  } finally {
    repo.cleanup();
  }
});

// Keep cloneMachineIR import referenced for type sanity
void cloneMachineIR;
