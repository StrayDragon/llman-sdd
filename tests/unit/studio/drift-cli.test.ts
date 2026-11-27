import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listStudioStates, readStudioState } from '@llman-sdd/core';

import { makeNodeStudioStateIo } from '../../../apps/cli/src/commands/studio.ts';
import { initGitRepo } from '../../helpers/spawn.ts';

const CLI = join(import.meta.dirname, '..', '..', '..', 'apps', 'cli', 'src', 'main.ts');

const SAMPLE_SPEC = `# language: zh-CN
# purpose: 订单流转规范

功能: order

  @req:r12
  规则: 订单审批流转
    订单从待审批流转至已通过或已驳回。

    @transitions
    场景大纲: 审批流程
      假如 当前状态为 <from> 且满足 <guard>
      当 触发 <event>
      那么 进入 <to> 状态

      例子:
        | from   | event | guard      | to     |
        | 待审批 | 批准  | 金额<=5000 | 已通过 |
        | 待审批 | 驳回  |            | 已驳回 |
`;

function runCli(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  const { LLMAN_SDD_HARNESS_ACTIVE: _guard, ...env } = process.env;
  const proc = spawnSync('bun', [CLI, ...args], { cwd, encoding: 'utf8', env });
  return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
}

describe('llman-sdd studio drift CLI subprocess integration (r150)', () => {
  test('pure --since mode exits 0 even with --fail-on-shadow and outputs minimal @llmanspec: slice', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llman-studio-drift-since-'));
    try {
      initGitRepo(dir, 'main');
      mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'llmanspec', 'config.yaml'), 'version: "1.0"\nlocale: zh-Hans\n');
      writeFileSync(join(dir, 'llmanspec', 'specs', 'order.feature'), SAMPLE_SPEC);
      writeFileSync(
        join(dir, 'src', 'order.ts'),
        '// @llmanspec:r12\nexport function approve(n: number) {\n  return n <= 5000;\n}\n',
      );
      spawnSync('git', ['add', '-A'], { cwd: dir });
      spawnSync('git', ['commit', '-qm', 'init'], { cwd: dir });

      // Modify anchored code in working tree
      writeFileSync(
        join(dir, 'src', 'order.ts'),
        '// @llmanspec:r12\nexport function approve(n: number) {\n  if (n > 5000) return "finance";\n  return n <= 5000;\n}\n',
      );

      const res = runCli(['studio', 'drift', '--since', 'HEAD', '--fail-on-shadow', '--json'], dir);
      expect(res.code).toBe(0);
      const parsed = JSON.parse(res.stdout) as {
        mode: string;
        slicePacket: {
          matchedFiles: Array<{ file: string }>;
          impactedSpecs: Array<{ reqId: string; capability: string }>;
        };
      };
      expect(parsed.mode).toBe('since');
      expect(parsed.slicePacket.matchedFiles.map((f) => f.file)).toEqual(['src/order.ts']);
      expect(parsed.slicePacket.impactedSpecs[0]).toMatchObject({
        capability: 'order',
        reqId: 'r12',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--trace --write-state --fail-on-shadow exits 1, writes drift-trace proposal, and never touches specs/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llman-studio-drift-trace-'));
    try {
      initGitRepo(dir, 'main');
      mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
      writeFileSync(join(dir, 'llmanspec', 'config.yaml'), 'version: "1.0"\nlocale: zh-Hans\n');
      const specPath = join(dir, 'llmanspec', 'specs', 'order.feature');
      writeFileSync(specPath, SAMPLE_SPEC);
      const tracePath = join(dir, 'trace.jsonl');
      writeFileSync(
        tracePath,
        [
          '{"machine":"order","from":"待审批","event":"批准","guard":"金额<=5000","to":"已通过"}',
          '{"machine":"order","from":"待审批","event":"超额转审","to":"财务复核"}',
        ].join('\n'),
      );

      const res = runCli(
        [
          'studio',
          'drift',
          '--trace',
          tracePath,
          '--write-state',
          '--fail-on-shadow',
          '--compact-json',
        ],
        dir,
      );
      expect(res.code).toBe(1);
      expect(res.stdout.trim().includes('\n')).toBe(false);
      const parsed = JSON.parse(res.stdout) as {
        reconcile: { shadowTransitions: unknown[]; uncoveredTransitions: unknown[] };
        writtenState: { stateId: string; addedProposalIds: string[] };
      };
      expect(parsed.reconcile.shadowTransitions.length).toBe(1);
      expect(parsed.reconcile.uncoveredTransitions.length).toBe(1);
      expect(parsed.writtenState.addedProposalIds.length).toBe(1);

      // Verify atomic state persisted with source: 'drift-trace' & pending status
      const io = makeNodeStudioStateIo(dir);
      const states = listStudioStates(io);
      expect(states.length).toBe(1);
      const doc = readStudioState(io, states[0]!.id);
      expect(doc.revisions.length).toBe(1);
      expect(doc.revisions[0]!.source).toBe('drift-trace');
      expect(doc.revisions[0]!.status).toBe('pending');

      // Verify llmanspec/specs/ untouched byte-for-byte
      expect(readFileSync(specPath, 'utf8')).toBe(SAMPLE_SPEC);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
