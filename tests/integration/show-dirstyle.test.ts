import { afterAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decode } from '@toon-format/toon';

// P1 (fix-show-dirstyle-specs): show 的 spec 判定/路径解析必须与
// collectSpecs/discoverSpecs 同口径——目录式 `specs/<cap>/<cap>.feature`
// 与扁平 `specs/<cap>.feature` 行为一致;未命中维持单行 `spec not found`。
const MAIN_TS = join(import.meta.dirname, '..', '..', 'apps', 'cli', 'src', 'main.ts');
const TMP_ROOTS: string[] = [];

const SPEC_BODY = (cap: string): string => `# language: zh-CN
# capability: ${cap}
# purpose: p
# scope: x/

功能: ${cap}

  @req:r1 @human
  场景: 规则
    - 系统 MUST x

  @req:r1 @executable
  场景: 验收
    假如 状态
    当 动作
    那么 结果
`;

function mkRepo(layout: 'flat' | 'dirstyle', cap: string): string {
  const root = mkdtempSync(join(tmpdir(), `llman-sdd-show-${layout}-`));
  TMP_ROOTS.push(root);
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  const specPath =
    layout === 'flat'
      ? join(root, 'llmanspec', 'specs', `${cap}.feature`)
      : join(root, 'llmanspec', 'specs', cap, `${cap}.feature`);
  mkdirSync(specPath.slice(0, specPath.lastIndexOf('/')), { recursive: true });
  writeFileSync(specPath, SPEC_BODY(cap));
  return root;
}

function runCli(root: string, args: string[]) {
  return spawnSync('bun', [MAIN_TS, ...args], { cwd: root, encoding: 'utf8' });
}

afterAll(() => {
  for (const root of TMP_ROOTS) rmSync(root, { recursive: true, force: true });
});

describe('show resolves specs in both layouts', () => {
  test('dir-style spec: default output is toon (toon-default-output)', () => {
    const root = mkRepo('dirstyle', 'agent-hooks');
    const res = runCli(root, ['show', 'agent-hooks']);
    expect(res.status).toBe(0);
    expect(res.stdout).not.toInclude('## Spec');
    const ir = decode(res.stdout) as { id: string; requirementCount: number };
    expect(ir.id).toBe('agent-hooks');
    expect(ir.requirementCount).toBe(1);
  });

  test('dir-style spec: --output human renders full text with morphology tail', () => {
    const root = mkRepo('dirstyle', 'agent-hooks');
    const res = runCli(root, ['show', 'agent-hooks', '--output', 'human']);
    expect(res.status).toBe(0);
    expect(res.stdout).toInclude('## Spec');
    expect(res.stdout).toInclude('## Morphology');
    expect(res.stdout).toInclude('功能: agent-hooks');
  });

  test('dir-style spec: --output json parses and ids the item', () => {
    const root = mkRepo('dirstyle', 'agent-hooks');
    const res = runCli(root, ['show', 'agent-hooks', '--output', 'json']);
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout) as { id: string; title: string };
    expect(parsed.id).toBe('agent-hooks');
    expect(parsed.title).toBe('agent-hooks');
  });

  test('dir-style spec: --type spec forced resolves and defaults to toon', () => {
    const root = mkRepo('dirstyle', 'agent-hooks');
    const res = runCli(root, ['show', 'agent-hooks', '--type', 'spec']);
    expect(res.status).toBe(0);
    expect(res.stdout).toInclude('id: agent-hooks');
  });

  test('missing item with --type spec: single-line spec not found, exit 1', () => {
    const root = mkRepo('dirstyle', 'agent-hooks');
    const res = runCli(root, ['show', 'no-such-cap', '--type', 'spec']);
    expect(res.status).toBe(1);
    // D5: 统一错误出口——域错误以单一 `Error: ` 前缀渲染
    expect(res.stderr.trim()).toBe('Error: spec not found: no-such-cap');
  });

  test('flat spec: default toon and human text both work', () => {
    const root = mkRepo('flat', 'loose-cap');
    const toon = runCli(root, ['show', 'loose-cap']);
    expect(toon.status).toBe(0);
    expect(toon.stdout).not.toInclude('## Spec');
    expect(decode(toon.stdout)).toHaveProperty('id', 'loose-cap');
    const human = runCli(root, ['show', 'loose-cap', '--output', 'human']);
    expect(human.status).toBe(0);
    expect(human.stdout).toInclude('## Spec');
    expect(human.stdout).toInclude('## Morphology');
  });
});

// 防回归:目录式 spec 存在时,同 id 不应被 change 解析劫持(r25 spec 精确匹配优先)。
describe('show does not misroute dir-style specs to change lookup', () => {
  test('no "change not found" for an existing dir-style spec id', () => {
    const root = mkRepo('dirstyle', 'agent-hooks');
    const res = runCli(root, ['show', 'agent-hooks']);
    expect(res.stderr).not.toInclude('change not found');
    expect(existsSync(join(root, 'llmanspec', 'specs', 'agent-hooks', 'agent-hooks.feature'))).toBe(
      true,
    );
  });
});
