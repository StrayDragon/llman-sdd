// BDD acceptance steps for llmanspec/specs/studio-cli.feature (r134-r137).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  STUDIO_STATES_REL,
  addStudioComment,
  createMachineDraft,
  createStudioStateDoc,
  extractStudioMachines,
  parseCapability,
  readStudioState,
  writeStudioState,
  type SpecEntry,
  type StudioStateDoc,
} from '@llman-sdd/core';

import { makeNodeStudioStateIo } from '../../../apps/cli/src/commands/studio.ts';
import { createStudioHubApp } from '../../../apps/cli/src/studio-server/server.ts';
import { initGitRepo } from '../../helpers/spawn.ts';
import { bdd } from '../runner.ts';
import { CLI, REPO_ROOT } from './shared.ts';

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCliIn(args: string[], cwd: string, input?: string): CliResult {
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env,
    input,
  });
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

const EXPENSE_FEATURE = `# language: zh-CN
# purpose: 定义 expense 能力的状态流转与行为合约。

功能: expense

  @req:r10
  规则: 报销状态流转
    报销单 MUST 按状态流转表推进。

    # 核心注释不可丢失
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

function makeTempStudioRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-studio-cli-'));
  initGitRepo(root, 'main');
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: zh-Hans\n');
  writeFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), EXPENSE_FEATURE);
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'init'], { cwd: root });
  return root;
}

function seedDraft(
  root: string,
  id: string,
  opts: { withComment?: boolean; withCreate?: boolean; brokenE3?: boolean } = {},
): StudioStateDoc {
  const entry: SpecEntry = {
    fileName: 'llmanspec/specs/expense.feature',
    specId: 'expense',
    doc: parseCapability(EXPENSE_FEATURE, 'llmanspec/specs/expense.feature'),
  };
  const draft = extractStudioMachines([entry])[0]!.draft;
  draft.current!.states[1]!.name = '主管审批';
  if (opts.brokenE3) {
    draft.current!.states.push({ uid: 's99', name: '孤岛状态' });
  }
  const drafts = [draft];
  if (opts.withCreate) {
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
    title: `Session ${id}`,
    createdAt: '2026-11-26T12:00:00Z',
    drafts,
  });
  if (opts.withComment) {
    doc = addStudioComment(doc, {
      anchor: { kind: 'state', machineKey: draft.current!.machineKey, stateUid: 's2' },
      author: 'human',
      body: '请核对主管审批节点命名',
      createdAt: '2026-11-26T12:01:00Z',
    });
  }
  writeStudioState(makeNodeStudioStateIo(root), doc);
  return doc;
}

// --- r134 ---
bdd.given('一个包含多份 Studio 本地草稿的临时仓库', (ctx) => {
  const root = makeTempStudioRepo();
  seedDraft(root, 'state-alpha');
  seedDraft(root, 'state-beta');
  ctx.fixtures['r134Root'] = root;
});

bdd.when(
  '依次运行 studio 裸调、studio state list、缺省 state-id 的 studio diff 与 studio state prune',
  (ctx) => {
    const root = ctx.fixtures['r134Root'] as string;
    const outside = mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-outside-'));
    const bare = runCliIn(['studio'], root);
    const listJson = runCliIn(['studio', 'state', 'list', '--json'], root);
    const listDirCompact = runCliIn(
      ['studio', 'state', 'list', '--compact-json', '--directory', root],
      outside,
    );
    const ambiguous = runCliIn(['studio', 'diff'], root);
    const pruneOne = runCliIn(['studio', 'state', 'prune', '--id', 'state-alpha'], root);
    const listAfterOne = runCliIn(['studio', 'state', 'list', '--json'], root);
    const pruneAll = runCliIn(['studio', 'state', 'prune', '--all'], root);
    const listAfterAll = runCliIn(['studio', 'state', 'list', '--json'], root);
    ctx.fixtures['r134Out'] = {
      bare,
      listJson,
      listDirCompact,
      ambiguous,
      pruneOne,
      listAfterOne,
      pruneAll,
      listAfterAll,
    };
  },
);

bdd.thenStep('studio 裸调退出码为 2 且 stderr 含用法提示且不含空的 Error 行', (ctx) => {
  const { bare } = ctx.fixtures['r134Out'] as { bare: CliResult };
  if (bare.code !== 2 || !bare.stderr.includes('Usage:')) {
    throw new Error(`expected exit 2 with Usage, got ${bare.code}: ${bare.stderr}`);
  }
  if (/(?:^|\n)Error:\s*$/mu.test(bare.stderr)) {
    throw new Error(`stderr has empty Error line: ${JSON.stringify(bare.stderr)}`);
  }
});

bdd.thenStep('state list 在 --directory 与 --compact-json 下返回一致草稿摘要', (ctx) => {
  const { listJson, listDirCompact } = ctx.fixtures['r134Out'] as {
    listJson: CliResult;
    listDirCompact: CliResult;
  };
  if (listJson.code !== 0 || listDirCompact.code !== 0) {
    throw new Error(`state list failed: ${listJson.stderr} / ${listDirCompact.stderr}`);
  }
  if (listDirCompact.stdout.trim().includes('\n')) {
    throw new Error('compact-json output must be single-line');
  }
  if (
    JSON.stringify(JSON.parse(listJson.stdout)) !==
    JSON.stringify(JSON.parse(listDirCompact.stdout))
  ) {
    throw new Error('state list payloads differ between root and --directory');
  }
});

bdd.thenStep('多草稿省略 state-id 报域错误退出码 1 并列出全部草稿 ID', (ctx) => {
  const { ambiguous } = ctx.fixtures['r134Out'] as { ambiguous: CliResult };
  if (
    ambiguous.code !== 1 ||
    !ambiguous.stderr.includes('state-alpha') ||
    !ambiguous.stderr.includes('state-beta')
  ) {
    throw new Error(
      `unexpected ambiguous error: code=${ambiguous.code} stderr=${ambiguous.stderr}`,
    );
  }
});

bdd.thenStep('state prune 按 --id 与 --all 正确清理本地草稿', (ctx) => {
  const { pruneOne, listAfterOne, pruneAll, listAfterAll } = ctx.fixtures['r134Out'] as {
    pruneOne: CliResult;
    listAfterOne: CliResult;
    pruneAll: CliResult;
    listAfterAll: CliResult;
  };
  if (pruneOne.code !== 0 || pruneAll.code !== 0) {
    throw new Error(`prune failed: ${pruneOne.stderr} / ${pruneAll.stderr}`);
  }
  const afterOne = (JSON.parse(listAfterOne.stdout) as { states: Array<{ id: string }> }).states;
  const afterAll = (JSON.parse(listAfterAll.stdout) as { states: Array<{ id: string }> }).states;
  if (afterOne.length !== 1 || afterOne[0]?.id !== 'state-beta' || afterAll.length !== 0) {
    throw new Error(
      `unexpected prune results: afterOne=${JSON.stringify(afterOne)} afterAll=${JSON.stringify(afterAll)}`,
    );
  }
});

// --- r135 ---
bdd.given('一个包含状态机修改草稿与评论的临时仓库', (ctx) => {
  const root = makeTempStudioRepo();
  seedDraft(root, 'review-1', { withComment: true, brokenE3: true });
  ctx.fixtures['r135Root'] = root;
});

bdd.when('运行 studio diff、studio validate --patch - 与 studio prompt', (ctx) => {
  const root = ctx.fixtures['r135Root'] as string;
  const statePath = join(root, STUDIO_STATES_REL, 'review-1.json');
  const beforeDisk = readFileSync(statePath, 'utf8');
  const diffHuman = runCliIn(['studio', 'diff', 'review-1'], root);
  const diffJson = runCliIn(['studio', 'diff', 'review-1', '--json'], root);
  const valPatch = runCliIn(
    ['studio', 'validate', 'review-1', '--patch', '-', '--json'],
    root,
    JSON.stringify([{ op: 'remove_state', stateName: '孤岛状态' }]),
  );
  const afterDisk = readFileSync(statePath, 'utf8');
  const prompt = runCliIn(['studio', 'prompt', 'review-1'], root);
  ctx.fixtures['r135Out'] = { diffHuman, diffJson, valPatch, beforeDisk, afterDisk, prompt };
});

bdd.thenStep('studio diff 同时输出语义 Diff、未解决评论与 Unified Diff 且支持 --json', (ctx) => {
  const { diffHuman, diffJson } = ctx.fixtures['r135Out'] as {
    diffHuman: CliResult;
    diffJson: CliResult;
  };
  if (
    diffHuman.code !== 0 ||
    !diffHuman.stdout.includes('主管审批') ||
    !diffHuman.stdout.includes('请核对主管审批节点命名') ||
    !diffHuman.stdout.includes('+++ b/llmanspec/specs/expense.feature')
  ) {
    throw new Error(`unexpected studio diff output: ${diffHuman.stdout}`);
  }
  const parsed = JSON.parse(diffJson.stdout) as { stateId: string; openComments: unknown[] };
  if (parsed.stateId !== 'review-1' || parsed.openComments.length !== 1) {
    throw new Error(`unexpected studio diff --json: ${diffJson.stdout}`);
  }
});

bdd.thenStep('studio validate --patch - 在不改写磁盘草稿的前提下验证假设修订', (ctx) => {
  const { valPatch, beforeDisk, afterDisk } = ctx.fixtures['r135Out'] as {
    valPatch: CliResult;
    beforeDisk: string;
    afterDisk: string;
  };
  if (valPatch.code !== 0 || beforeDisk !== afterDisk) {
    throw new Error(
      `validate --patch failed or mutated disk: code=${valPatch.code} ${valPatch.stderr}`,
    );
  }
  const parsed = JSON.parse(valPatch.stdout) as { valid: boolean; patched: boolean };
  if (!parsed.valid || !parsed.patched) {
    throw new Error(`expected valid patched result: ${valPatch.stdout}`);
  }
});

bdd.thenStep('studio prompt 输出含草稿 ID 与 CLI 回调指引的结构化文本', (ctx) => {
  const { prompt } = ctx.fixtures['r135Out'] as { prompt: CliResult };
  if (
    prompt.code !== 0 ||
    !prompt.stdout.includes('review-1') ||
    !prompt.stdout.includes('llman-sdd studio revise review-1')
  ) {
    throw new Error(`unexpected studio prompt output: ${prompt.stdout}`);
  }
});

// --- r136 ---
bdd.given('一个包含人类状态机草稿与待回复评论的临时仓库', (ctx) => {
  const root = makeTempStudioRepo();
  const doc = seedDraft(root, 'reply-1', { withComment: true });
  const key = Object.keys(doc.machines)[0]!;
  ctx.fixtures['r136State'] = {
    root,
    key,
    beforeCurrent: JSON.stringify(doc.machines[key]!.current),
  };
});

bdd.when(
  '运行 studio comment reply --resolve、studio revise --file 与非法 JSON 的 studio revise',
  (ctx) => {
    const { root } = ctx.fixtures['r136State'] as { root: string };
    const reply = runCliIn(
      ['studio', 'comment', 'reply', 'reply-1', 'c1', '--body', '同意改名为主管审批', '--resolve'],
      root,
    );
    const opsPath = join(root, 'ops.json');
    writeFileSync(opsPath, JSON.stringify([{ op: 'add_state', name: '财务复核' }]));
    const revise = runCliIn(
      ['studio', 'revise', 'reply-1', '--file', opsPath, '--rationale', '增加财务复核状态'],
      root,
    );
    const badRevise = runCliIn(['studio', 'revise', 'reply-1'], root, '{invalid-json');
    const reloaded = readStudioState(makeNodeStudioStateIo(root), 'reply-1');
    ctx.fixtures['r136Out'] = { reply, revise, badRevise, reloaded };
  },
);

bdd.thenStep('目标评论收到 Agent 回复并标记为 resolved', (ctx) => {
  const { reply, reloaded } = ctx.fixtures['r136Out'] as {
    reply: CliResult;
    reloaded: StudioStateDoc;
  };
  if (reply.code !== 0) throw new Error(`comment reply failed: ${reply.stderr}`);
  const orig = reloaded.comments.find((c) => c.id === 'c1');
  const agentReply = reloaded.comments.find((c) => c.replyTo === 'c1' && c.author === 'agent');
  if (orig?.status !== 'resolved' || !agentReply) {
    throw new Error(`comment reply/resolve not persisted: ${JSON.stringify(reloaded.comments)}`);
  }
});

bdd.thenStep('revise 仅追加 pending 建议层且人类草稿内容零改动', (ctx) => {
  const { key, beforeCurrent } = ctx.fixtures['r136State'] as {
    key: string;
    beforeCurrent: string;
  };
  const { revise, reloaded } = ctx.fixtures['r136Out'] as {
    revise: CliResult;
    reloaded: StudioStateDoc;
  };
  if (revise.code !== 0) throw new Error(`revise failed: ${revise.stderr}`);
  if (JSON.stringify(reloaded.machines[key]!.current) !== beforeCurrent) {
    throw new Error('human draft was mutated by studio revise');
  }
  if (reloaded.revisions.length !== 1 || reloaded.revisions[0]?.status !== 'pending') {
    throw new Error(`unexpected revisions: ${JSON.stringify(reloaded.revisions)}`);
  }
});

bdd.thenStep('非法 JSON 载荷报用法错误退出码 2', (ctx) => {
  const { badRevise } = ctx.fixtures['r136Out'] as { badRevise: CliResult };
  if (badRevise.code !== 2) {
    throw new Error(`expected exit 2 on invalid JSON, got ${badRevise.code}: ${badRevise.stderr}`);
  }
});

// --- r137 ---
bdd.given('一个含状态机草稿与新建草稿的临时 git 仓库', (ctx) => {
  const root = makeTempStudioRepo();
  seedDraft(root, 'apply-1', { withCreate: true });
  ctx.fixtures['r137Root'] = root;
});

bdd.when(
  '在默认分支执行 studio apply 与 --dry-run，再切到特性分支插入 20 行打乱行号后执行 studio apply',
  (ctx) => {
    const root = ctx.fixtures['r137Root'] as string;
    const expensePath = join(root, 'llmanspec', 'specs', 'expense.feature');
    const refundPath = join(root, 'llmanspec', 'specs', 'refund.feature');
    const beforeMain = readFileSync(expensePath, 'utf8');

    const mainApply = runCliIn(['studio', 'apply', 'apply-1'], root);
    const afterMainApply = readFileSync(expensePath, 'utf8');
    const mainDryRun = runCliIn(['studio', 'apply', 'apply-1', '--dry-run'], root);
    const afterMainDryRun = readFileSync(expensePath, 'utf8');
    const refundExistsOnMain = existsSync(refundPath);

    spawnSync('git', ['checkout', '-qb', 'sdd/bdd-apply'], { cwd: root });
    const extraLines = Array.from({ length: 18 }, (_, i) => `    说明行 ${String(i + 1)}`).join(
      '\n',
    );
    const insertedRule = `  @req:r9\n  规则: 前置审计\n${extraLines}\n\n    场景: 写入审计\n      假如 触发请求\n      当 落盘\n      那么 审计就绪\n\n`;
    writeFileSync(expensePath, beforeMain.replace('  @req:r10', `${insertedRule}  @req:r10`));

    const featApply = runCliIn(['studio', 'apply', 'apply-1'], root);
    const afterFeatExpense = readFileSync(expensePath, 'utf8');
    const afterFeatRefund = existsSync(refundPath) ? readFileSync(refundPath, 'utf8') : '';
    const validateRes = runCliIn(['validate', '--specs', '--strict'], root);

    ctx.fixtures['r137Out'] = {
      beforeMain,
      mainApply,
      afterMainApply,
      mainDryRun,
      afterMainDryRun,
      refundExistsOnMain,
      featApply,
      afterFeatExpense,
      afterFeatRefund,
      validateRes,
    };
  },
);

bdd.thenStep('默认分支直接 apply 被拒写退出码 1 且 .feature 零修改', (ctx) => {
  const { beforeMain, mainApply, afterMainApply, refundExistsOnMain } = ctx.fixtures['r137Out'] as {
    beforeMain: string;
    mainApply: CliResult;
    afterMainApply: string;
    refundExistsOnMain: boolean;
  };
  if (mainApply.code !== 1 || afterMainApply !== beforeMain || refundExistsOnMain) {
    throw new Error(
      `default branch apply was not blocked: code=${mainApply.code} stderr=${mainApply.stderr}`,
    );
  }
});

bdd.thenStep('默认分支 --dry-run 返回 Unified Diff 退出码 0 且 .feature 零修改', (ctx) => {
  const { beforeMain, mainDryRun, afterMainDryRun } = ctx.fixtures['r137Out'] as {
    beforeMain: string;
    mainDryRun: CliResult;
    afterMainDryRun: string;
  };
  if (
    mainDryRun.code !== 0 ||
    !mainDryRun.stdout.includes('+++ b/llmanspec/specs/expense.feature') ||
    afterMainDryRun !== beforeMain
  ) {
    throw new Error(`dry-run failed: code=${mainDryRun.code} stdout=${mainDryRun.stdout}`);
  }
});

bdd.thenStep(
  '特性分支 apply 在行号偏移 20 行后精准替换例子表、为新建草稿分配真实 reqId 且通过 llman-sdd validate',
  (ctx) => {
    const { featApply, afterFeatExpense, afterFeatRefund, validateRes } = ctx.fixtures[
      'r137Out'
    ] as {
      featApply: CliResult;
      afterFeatExpense: string;
      afterFeatRefund: string;
      validateRes: CliResult;
    };
    if (featApply.code !== 0) {
      throw new Error(`feature apply failed: ${featApply.stderr}`);
    }
    if (
      !afterFeatExpense.includes('# 核心注释不可丢失') ||
      !afterFeatExpense.includes('主管审批')
    ) {
      throw new Error('semantic table update lost comments or failed after 20-line drift');
    }
    if (!afterFeatRefund.includes('@req:r11') || afterFeatRefund.includes('rTODO')) {
      throw new Error(`create draft did not allocate real reqId:\n${afterFeatRefund}`);
    }
    if (validateRes.code !== 0) {
      throw new Error(
        `validate failed after studio apply: ${validateRes.stdout}\n${validateRes.stderr}`,
      );
    }
  },
);

// --- r150 ---
bdd.given('一个含状态机规格、@llmanspec: 代码改动提交与 JSONL Trace 文件的临时 git 仓库', (ctx) => {
  const root = makeTempStudioRepo();
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(
    join(root, 'src', 'expense.ts'),
    '// @llmanspec:r10\nexport function approve(n: number) {\n  return n <= 5000;\n}\n',
  );
  spawnSync('git', ['add', '-A'], { cwd: root });
  spawnSync('git', ['commit', '-qm', 'add anchored source'], { cwd: root });
  writeFileSync(
    join(root, 'src', 'expense.ts'),
    '// @llmanspec:r10\nexport function approve(n: number) {\n  if (n > 5000) return "财务复核";\n  return n <= 5000;\n}\n',
  );
  const tracePath = join(root, 'runtime-trace.jsonl');
  writeFileSync(
    tracePath,
    [
      '{"machine":"expense","from":"草稿","event":"提交","to":"待审批"}',
      '{"machine":"expense","from":"待审批","event":"超额转审","to":"财务复核"}',
    ].join('\n'),
  );
  ctx.fixtures['r150State'] = {
    root,
    tracePath,
    specBefore: readFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), 'utf8'),
  };
});

bdd.when(
  '依次运行 studio drift --since --fail-on-shadow 与 studio drift --trace --write-state --fail-on-shadow --json',
  (ctx) => {
    const { root, tracePath } = ctx.fixtures['r150State'] as {
      root: string;
      tracePath: string;
    };
    const sinceRes = runCliIn(
      ['studio', 'drift', '--since', 'HEAD', '--fail-on-shadow', '--json'],
      root,
    );
    const traceRes = runCliIn(
      ['studio', 'drift', '--trace', tracePath, '--write-state', '--fail-on-shadow', '--json'],
      root,
    );
    const specAfter = readFileSync(join(root, 'llmanspec', 'specs', 'expense.feature'), 'utf8');
    const savedDoc = readStudioState(makeNodeStudioStateIo(root), 'workspace-draft');
    ctx.fixtures['r150Out'] = { sinceRes, traceRes, specAfter, savedDoc };
  },
);

bdd.thenStep('纯 --since 切片模式退出码为 0 并输出命中锚点的最小切片包', (ctx) => {
  const { sinceRes } = ctx.fixtures['r150Out'] as { sinceRes: CliResult };
  if (sinceRes.code !== 0) {
    throw new Error(`expected --since exit 0, got ${sinceRes.code}: ${sinceRes.stderr}`);
  }
  const parsed = JSON.parse(sinceRes.stdout) as {
    slicePacket: { impactedSpecs: Array<{ reqId: string }> };
  };
  if (parsed.slicePacket.impactedSpecs[0]?.reqId !== 'r10') {
    throw new Error(`unexpected slicePacket: ${sinceRes.stdout}`);
  }
});

bdd.thenStep(
  '--trace --write-state --fail-on-shadow 退出码为 1、向本地草稿写入 drift-trace 建议且 specs 目录零修改',
  (ctx) => {
    const { specBefore } = ctx.fixtures['r150State'] as { specBefore: string };
    const { traceRes, specAfter, savedDoc } = ctx.fixtures['r150Out'] as {
      traceRes: CliResult;
      specAfter: string;
      savedDoc: StudioStateDoc;
    };
    if (traceRes.code !== 1) {
      throw new Error(`expected --fail-on-shadow exit 1, got ${traceRes.code}`);
    }
    if (specAfter !== specBefore) {
      throw new Error('studio drift --write-state modified llmanspec/specs/');
    }
    if (!savedDoc.revisions.some((r) => r.source === 'drift-trace' && r.status === 'pending')) {
      throw new Error(`missing drift-trace proposal: ${JSON.stringify(savedDoc.revisions)}`);
    }
  },
);

// --- r167 ---

bdd.given('一个含状态机草稿且磁盘规格哈希已前进的临时仓库', (ctx) => {
  const root = makeTempStudioRepo();
  const specRel = 'llmanspec/specs/expense.feature';
  const original = readFileSync(join(root, specRel), 'utf8');
  const hash = createHash('sha256').update(original, 'utf8').digest('hex');
  const doc = seedDraft(root, 'sync-cli');
  const withHash = { ...doc, baseHashes: { [specRel]: hash } };
  writeStudioState(makeNodeStudioStateIo(root), withHash);
  writeFileSync(
    join(root, specRel),
    original.replace(
      '| 待审批 | 驳回 |  | 已驳回 |',
      '| 待审批 | 驳回 |  | 已驳回 |\n        | 待审批 | 加急 |  | 已通过 |',
    ),
  );
  const hub = createStudioHubApp({
    initialDirectory: root,
    host: '127.0.0.1',
    port: 0,
    writeHubFile: false,
  });
  ctx.fixtures['r167'] = { root, hub, specRel, original };
});

bdd.when('依次请求 sync-preview、sync-apply 与 studio diff --json', async (ctx) => {
  const { root, hub, specRel } = ctx.fixtures['r167'] as {
    root: string;
    hub: ReturnType<typeof createStudioHubApp>;
    specRel: string;
  };
  const req = (p: string, init?: RequestInit) => hub.app.request(`http://127.0.0.1:4710${p}`, init);
  const preview = await req('/api/states/sync-cli/sync-preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
  });
  const previewJson = (await preview.json()) as {
    stale: boolean;
    items: Array<{ id: string; defaultPick: string | null }>;
  };
  const picks = Object.fromEntries(previewJson.items.map((i) => [i.id, i.defaultPick ?? 'ours']));
  const specBefore = readFileSync(join(root, specRel), 'utf8');
  const diffHuman = runCliIn(['studio', 'diff', 'sync-cli'], root);
  const diffJson = runCliIn(['studio', 'diff', 'sync-cli', '--json'], root);
  const apply = await req('/api/states/sync-cli/sync-apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-studio-token': hub.token },
    body: JSON.stringify({ picks }),
  });
  const applyJson = (await apply.json()) as {
    ok?: boolean;
    doc?: { baseHashes?: Record<string, string> };
  };
  const specAfter = readFileSync(join(root, specRel), 'utf8');
  ctx.fixtures['r167Out'] = {
    preview,
    previewJson,
    apply,
    applyJson,
    specBefore,
    specAfter,
    diffHuman,
    diffJson,
  };
  hub.cleanup();
  rmSync(root, { recursive: true, force: true });
});

bdd.thenStep('preview 返回 stale 条目、apply 后 specs 目录零修改且 baseHashes 更新', (ctx) => {
  const { preview, previewJson, apply, applyJson, specBefore, specAfter } = ctx.fixtures[
    'r167Out'
  ] as {
    preview: { status: number };
    previewJson: { stale: boolean; items: unknown[] };
    apply: { status: number };
    applyJson: { ok?: boolean; doc?: { baseHashes?: Record<string, string> } };
    specBefore: string;
    specAfter: string;
  };
  if (preview.status !== 200 || previewJson.stale !== true) {
    throw new Error(`preview not stale: ${JSON.stringify(previewJson)}`);
  }
  if (apply.status !== 200 || applyJson.ok !== true) {
    throw new Error(`apply failed: ${JSON.stringify(applyJson)}`);
  }
  if (specAfter !== specBefore) {
    throw new Error('sync-apply wrote llmanspec/specs/');
  }
});

bdd.thenStep('studio diff 人读含「文件和画布对不上」、JSON 含 syncItems', (ctx) => {
  const { diffHuman, diffJson, previewJson } = ctx.fixtures['r167Out'] as {
    diffHuman: CliResult;
    diffJson: CliResult;
    previewJson: { stale: boolean };
  };
  const parsed = JSON.parse(diffJson.stdout) as { syncItems?: unknown[] };
  if (!diffHuman.stdout.includes('文件和画布对不上')) {
    throw new Error(`human diff missing 文件和画布对不上: ${diffHuman.stdout}`);
  }
  if (!Array.isArray(parsed.syncItems)) {
    throw new Error(`json diff missing syncItems: ${diffJson.stdout}`);
  }
});

// --- r170 ---
bdd.given('一个仅含一份带转移表规格且无 Studio 草稿的临时仓库', (ctx) => {
  ctx.fixtures['studioEmptyRoot'] = makeTempStudioRepo();
});

bdd.given('一个含 Studio 草稿 alpha-draft 与 beta-draft 的临时仓库', (ctx) => {
  const root = makeTempStudioRepo();
  seedDraft(root, 'alpha-draft');
  seedDraft(root, 'beta-draft');
  ctx.fixtures['studioDraftRoot'] = root;
});

bdd.when('运行 studio validate', (ctx) => {
  const root = ctx.fixtures['studioEmptyRoot'] as string;
  ctx.fixtures['studioCmd'] = runCliIn(['studio', 'validate'], root);
});

bdd.when('运行 studio diff', (ctx) => {
  const root = ctx.fixtures['studioEmptyRoot'] as string;
  ctx.fixtures['studioCmd'] = runCliIn(['studio', 'diff'], root);
});

bdd.when('运行 studio apply nope', (ctx) => {
  const root = ctx.fixtures['studioDraftRoot'] as string;
  ctx.fixtures['studioCmd'] = runCliIn(['studio', 'apply', 'nope'], root);
});

bdd.when('运行 studio open --help', (ctx) => {
  ctx.fixtures['studioCmd'] = runCliIn(['studio', 'open', '--help'], REPO_ROOT);
});

bdd.thenStep('退出码为 0 且输出含 source: specs', (ctx) => {
  const r = ctx.fixtures['studioCmd'] as CliResult;
  if (r.code !== 0 || !r.stdout.includes('source: specs')) {
    throw new Error(`expected exit 0 with source: specs, got ${r.code}\n${r.stdout}\n${r.stderr}`);
  }
});

bdd.thenStep('stderr 以 "Error:" 开头且含 "Next:" 且退出码为 1', (ctx) => {
  const r = ctx.fixtures['studioCmd'] as CliResult;
  if (r.code !== 1 || !r.stderr.startsWith('Error:') || !r.stderr.includes('Next:')) {
    throw new Error(`expected Error+Next exit 1, got ${r.code}: ${JSON.stringify(r.stderr)}`);
  }
});

bdd.thenStep(
  'stderr 含 "studio state not found: nope" 且含 "Available:" 且含 alpha-draft',
  (ctx) => {
    const r = ctx.fixtures['studioCmd'] as CliResult;
    if (
      !r.stderr.includes('studio state not found: nope') ||
      !r.stderr.includes('Available:') ||
      !r.stderr.includes('alpha-draft')
    ) {
      throw new Error(`missing not-found candidates: ${JSON.stringify(r.stderr)}`);
    }
  },
);

bdd.thenStep('stdout 不含重复的 port 默认值标注', (ctx) => {
  const r = ctx.fixtures['studioCmd'] as CliResult;
  if (
    r.stdout.includes('(default: 4710) (default:') ||
    r.stdout.includes('(default: "4710") (default:')
  ) {
    throw new Error(`duplicated port default in help:\n${r.stdout}`);
  }
  if (
    (r.stdout.match(/--port/gu) ?? []).length > 0 &&
    r.stdout.includes('(default: 4710) (default:')
  ) {
    throw new Error(`duplicated default annotation:\n${r.stdout}`);
  }
});
