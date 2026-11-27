import { afterEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildTheoremLockManifest,
  parseTheoremFile,
  studioSearchResponseSchema,
  validateTheoremSet,
  verifyTheoremLockManifest,
} from '@llman-sdd/core';

import { createStudioHubApp } from '../../apps/cli/src/studio-server/server.ts';
import { runCli } from '../helpers/spawn.ts';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const SAMPLE_THEOREM = `---
title: "支付不变量"
owner: human
---

## theorem:idempotent-ledger — 账本写入幂等性
- **statement**: 所有扣款与退款操作必须携带全局唯一幂等键，禁止无幂等键直写账本表。
- **rationale**: 防止网络重试造成重复扣款。
- **gate**: \`true\`
- **scope**: \`packages/ledger/**\`
- **tags**: ledger, safety
`;

describe('human theorems pure parser, lock manifest & CLI (r161, r162)', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  test('pure parser, duplicate detector, and lock verification work deterministically', () => {
    const parsed = parseTheoremFile('llmanspec/theorems/ledger.md', SAMPLE_THEOREM);
    expect(parsed.issues).toEqual([]);
    expect(parsed.theorems).toHaveLength(1);
    expect(parsed.theorems[0]!.id).toBe('idempotent-ledger');
    expect(parsed.theorems[0]!.gate).toBe('true');

    const dup = validateTheoremSet([
      { file: 'a.md', content: SAMPLE_THEOREM },
      { file: 'b.md', content: SAMPLE_THEOREM },
    ]);
    expect(dup.ok).toBe(false);
    expect(dup.issues.some((i) => i.includes('duplicate theorem id'))).toBe(true);

    const files = [{ file: 'llmanspec/theorems/ledger.md', content: SAMPLE_THEOREM }];
    const lock = buildTheoremLockManifest(files, sha256, '2026-11-27T00:00:00.000Z');
    expect(verifyTheoremLockManifest(files, lock, sha256).status).toBe('sealed');

    const tampered = verifyTheoremLockManifest(
      [{ file: 'llmanspec/theorems/ledger.md', content: `${SAMPLE_THEOREM}\n# tampered` }],
      lock,
      sha256,
    );
    expect(tampered.status).toBe('tampered');
    expect(tampered.issues[0]).toContain('modified without human re-seal');
  });

  test('CLI theorem lock/check/unlock enforces tamper detection and Studio exposes read-only recall', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'llman-sdd-theorems-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
    mkdirSync(join(dir, 'llmanspec', 'theorems'), { recursive: true });
    writeFileSync(join(dir, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: zh-Hans\n');
    const thFile = join(dir, 'llmanspec', 'theorems', 'ledger.md');
    writeFileSync(thFile, SAMPLE_THEOREM);

    // 1. Lock + check passes (with --run-gates)
    const lockRes = runCli(['theorem', 'lock', '--root', '-d', dir], dir);
    expect(lockRes.status).toBe(0);
    expect(lockRes.stdout).toContain('sudo chown root:root');

    const checkOk = runCli(['theorem', 'check', '--run-gates', '--json', '-d', dir], dir);
    expect(checkOk.status).toBe(0);
    expect(JSON.parse(checkOk.stdout).ok).toBe(true);

    // 2. Studio bootstrap & search expose theorems read-only
    const hub = createStudioHubApp({
      initialDirectory: dir,
      host: '127.0.0.1',
      port: 0,
      writeHubFile: false,
    });
    cleanups.push(() => hub.cleanup());
    const bootRes = await hub.app.fetch(
      new Request(`http://127.0.0.1:4710/api/p/${encodeURIComponent(hub.activeWsKey)}/bootstrap`, {
        headers: { host: '127.0.0.1:4710' },
      }),
    );
    const bootJson = (await bootRes.json()) as {
      theorems?: Array<{ id: string; readOnly: boolean }>;
      theoremLockStatus?: string;
    };
    expect(bootJson.theoremLockStatus).toBe('sealed');
    expect(bootJson.theorems?.[0]?.id).toBe('idempotent-ledger');
    expect(bootJson.theorems?.[0]?.readOnly).toBe(true);

    const searchRes = await hub.app.fetch(
      new Request(`http://127.0.0.1:4710/api/p/${encodeURIComponent(hub.activeWsKey)}/search`, {
        method: 'POST',
        headers: {
          host: '127.0.0.1:4710',
          'content-type': 'application/json',
          'x-studio-token': hub.token,
        },
        body: JSON.stringify({ query: '幂等键' }),
      }),
    );
    const searchJson = studioSearchResponseSchema.parse(await searchRes.json());
    expect(
      searchJson.hits.some((h) => h.targetKind === 'theorem' && h.targetId === 'idempotent-ledger'),
    ).toBe(true);

    // 3. Unlock, tamper without re-seal → check fails with rc 1
    expect(runCli(['theorem', 'unlock', '-d', dir], dir).status).toBe(0);
    writeFileSync(thFile, `${SAMPLE_THEOREM}\n# unauthorized agent edit\n`);
    const checkTampered = runCli(['theorem', 'check', '-d', dir], dir);
    expect(checkTampered.status).toBe(1);
    expect(checkTampered.stderr).toContain('ledger.md');
  });
});
