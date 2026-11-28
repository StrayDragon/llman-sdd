#!/usr/bin/env bun
// Playwright scene: nest=3 deep link, parent portal, macro-edge focus (studio-web r172/r174).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';

import {
  startStudioHub,
  type RunningStudioHub,
} from '../../../apps/cli/src/studio-server/server.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DIST_DIR = join(REPO_ROOT, 'apps', 'studio', 'dist');
const ARTIFACT_DIR = join(REPO_ROOT, '.llman-sdd', 'e2e-artifacts');

const STEPS = `      假如 当前处于 <from>
      当 触发 <event>
      那么 流转至 <to>`;

const STATE_STEPS = `      假如 状态 <状态>
      当 读取属性
      那么 子机为 <子机>`;

function nestFeature(id: string, req: string, rows: string, states?: string): string {
  return [
    '# language: zh-CN',
    `# purpose: ${id} nest fixture`,
    `功能: ${id}`,
    '',
    `  @req:${req}`,
    `  规则: ${id} 流程`,
    '    流程 MUST 可抽取。',
    '',
    '    @transitions',
    '    场景大纲: 主流程',
    STEPS,
    '      例子:',
    '        | from | event | to |',
    rows,
    ...(states
      ? [
          '',
          '    @states',
          '    场景大纲: 状态属性',
          STATE_STEPS,
          '      例子:',
          '        | 状态 | 子机 |',
          states,
        ]
      : []),
    '',
  ].join('\n');
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'llman-sdd-e2e-nest-'));
  cpSync(join(REPO_ROOT, 'llmanspec', 'specs'), join(dir, 'llmanspec', 'specs'), {
    recursive: true,
  });
  cpSync(join(REPO_ROOT, 'llmanspec', 'config.yaml'), join(dir, 'llmanspec', 'config.yaml'));
  writeFileSync(
    join(dir, 'llmanspec', 'specs', 'nest-a.feature'),
    nestFeature(
      'nest-a',
      'r1',
      '        | 外层入 | go | 宿主 |\n        | 宿主 | out | 外层出 |',
      '        | 宿主 | @req:r2 |',
    ),
  );
  writeFileSync(
    join(dir, 'llmanspec', 'specs', 'nest-b.feature'),
    nestFeature(
      'nest-b',
      'r2',
      '        | 中层入 | go | 中宿主 |\n        | 中宿主 | out | 中层出 |',
      '        | 中宿主 | @req:r3 |',
    ),
  );
  writeFileSync(
    join(dir, 'llmanspec', 'specs', 'nest-c.feature'),
    nestFeature('nest-c', 'r3', '        | 叶入 | go | 叶出 |'),
  );
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=e2e', '-c', 'user.email=e2e@local', 'commit', '-qm', 'fixture']);
  return dir;
}

async function settle(page: Page, ms = 800): Promise<void> {
  await page.waitForTimeout(ms);
}

async function main(): Promise<number> {
  const dir = makeFixture();
  let browser: Browser | null = null;
  let hub: RunningStudioHub | null = null;
  const failures: string[] = [];
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      console.error(
        `[qa-studio-e2e nest] Chromium missing: ${(err as Error).message.split('\n')[0]}`,
      );
      return 2;
    }
    hub = await startStudioHub({
      initialDirectory: dir,
      port: 0,
      writeHubFile: false,
      studioDistDir: DIST_DIR,
    });
    const boot = (await (
      await fetch(`${hub.url}/api/p/${encodeURIComponent(hub.activeWsKey)}/bootstrap`)
    ).json()) as {
      specs?: Array<{ id: string; machineKeys?: string[] }>;
      edges?: Array<{ id: string; from: string; to: string }>;
    };
    const k0 = boot.specs?.find((s) => s.id === 'nest-a')?.machineKeys?.[0];
    const k1 = boot.specs?.find((s) => s.id === 'nest-b')?.machineKeys?.[0];
    const k2 = boot.specs?.find((s) => s.id === 'nest-c')?.machineKeys?.[0];
    if (!k0 || !k1 || !k2) {
      console.error('[qa-studio-e2e nest] nest machine keys missing from bootstrap');
      return 1;
    }
    const wsUrl = `${hub.url}/p/${encodeURIComponent(hub.activeWsKey)}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const nestUrl = `${wsUrl}?kind=machine&target=${encodeURIComponent(k0)}&nest=${encodeURIComponent(`${k0},${k1},${k2}`)}`;
    await page.goto(nestUrl);
    await page.waitForSelector('.react-flow__node', { timeout: 20_000 });
    await settle(page, 1400);
    const crumbOnFrame = page.locator('.machine-boundary-frame [data-nest-crumb]');
    const level = await crumbOnFrame.getAttribute('data-nest-level');
    if (level !== 'L3') failures.push(`expected L3 breadcrumb on boundary, got ${String(level)}`);
    if ((await page.locator('.studio-island[data-nest-crumb]').count()) !== 0) {
      failures.push('nest crumb must not be a canvas-top island');
    }
    const stepCount = await crumbOnFrame.locator('[data-nest-step]').count();
    if (stepCount < 3) {
      failures.push(`expected multilevel crumb with >=3 steps, got ${String(stepCount)}`);
    }
    const backText = (await crumbOnFrame.locator('button').first().textContent())
      ?.replace(/\s+/gu, ' ')
      .trim();
    if (backText !== '返回上层') {
      failures.push(`back button should be exactly 返回上层, got ${String(backText)}`);
    }
    const portal = page.locator('[data-parent-portal]').first();
    if ((await portal.count()) === 0) {
      failures.push('parent portal missing at L3');
    } else {
      await portal.click();
      await settle(page, 800);
      const after = await crumbOnFrame.getAttribute('data-nest-level');
      if (after !== 'L2') failures.push(`portal click expected L2, got ${String(after)}`);
      const selected = await page
        .locator('.react-flow__node.selected, .react-flow__node-stateNode.selected')
        .count();
      if (selected < 1) failures.push('expected neighbor state selected after portal click');
    }

    const specIds = new Set((boot.specs ?? []).map((s) => s.id));
    const forestEdge = (boot.edges ?? []).find((e) => specIds.has(e.from) && specIds.has(e.to));
    const edgeId = forestEdge?.id;
    if (!edgeId) {
      failures.push('no forest edge for macro-edge focus');
    } else {
      await page.goto(
        `${wsUrl}?kind=macro&target=default&focus=${encodeURIComponent(`macro-edge:${edgeId}`)}`,
      );
      await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
      await settle(page, 1400);
      const focusAttr = await page.locator('[data-canvas-focus]').getAttribute('data-canvas-focus');
      if (focusAttr !== `macro-edge:${edgeId}`) {
        failures.push(`expected canvas focus macro-edge:${edgeId}, got ${String(focusAttr)}`);
      }
      const edge = page
        .locator(
          `.react-flow__edge.selected[data-id="${edgeId}"], .react-flow__edge[data-id="${edgeId}"], [data-testid="rf__edge-${edgeId}"]`,
        )
        .first();
      const focusedPath = page.locator('[data-edge-selected="true"]').first();
      const selectedCount = (await edge.count()) + (await focusedPath.count());
      if (selectedCount === 0) {
        const ids = await page
          .locator('.react-flow__edge')
          .evaluateAll((els) =>
            els.slice(0, 8).map((el) => el.getAttribute('data-id') ?? el.className),
          );
        failures.push(
          `macro-edge was not selected (want ${edgeId}; canvas=${String(focusAttr)}; edges=${ids.join(',')})`,
        );
      } else {
        await edge.click({ button: 'right', force: true, timeout: 8_000 }).catch(async () => {
          await focusedPath.click({ button: 'right', force: true, timeout: 8_000 });
        });
        await settle(page, 350);
        const commentItem = page
          .locator('button, [role="menuitem"]', { hasText: '留评论' })
          .first();
        if ((await commentItem.count()) > 0) {
          await commentItem.click();
          await settle(page, 250);
          const eyebrow = await page.locator('body').innerText();
          if (!eyebrow.includes('规格连线')) {
            failures.push('comment popover missing macro-edge 规格连线 anchor');
          }
        } else {
          failures.push('macro-edge radial 留评论 not found');
        }
      }
    }

    const legacyUrl = `${wsUrl}?kind=machine&target=${encodeURIComponent(k0)}`;
    await page.goto(legacyUrl);
    await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
    await settle(page, 800);
    if ((await page.locator('[data-nest-crumb]').count()) !== 0) {
      failures.push('legacy deep link without nest should not show nest breadcrumb');
    }

    await context.close();
    if (failures.length > 0) {
      mkdirSync(ARTIFACT_DIR, { recursive: true });
      console.error(`[qa-studio-e2e nest] ${String(failures.length)} failure(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      return 1;
    }
    console.log('[pass] qa-studio-e2e nest deep-link (L3 portal + macro-edge focus)');
    return 0;
  } finally {
    await browser?.close();
    await hub?.close();
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
}

process.exitCode = await main();
