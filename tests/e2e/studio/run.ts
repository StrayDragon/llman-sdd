#!/usr/bin/env bun
// Real-browser E2E gate for Studio Web visual invariants (studio-web r156). Not part of `just qa`.
// Starts an in-process Studio Hub (port 0, no hub file) over a temp git fixture that copies
// this repo's llmanspec/, drives headless Chromium via playwright-core, collects DOM/SVG
// geometry and hands it to the pure judge in ./invariants.ts.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { chromium, type Browser, type Page } from 'playwright-core';

import {
  startStudioHub,
  type RunningStudioHub,
} from '../../../apps/cli/src/studio-server/server.ts';
import {
  checkStudioInvariants,
  type StudioGeometrySnapshot,
  type StudioInvariantViolation,
} from './invariants.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DIST_DIR = join(REPO_ROOT, 'apps', 'studio', 'dist');
const ARTIFACT_DIR = join(REPO_ROOT, '.llman-sdd', 'e2e-artifacts');
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const;

/**
 * Known waivers (design D6): violations that need a dedicated change. Each entry must name
 * the follow-up change. Matching is by `invariant` + substring of `detail`. Target: empty.
 */
const KNOWN_WAIVERS: ReadonlyArray<{ invariant: string; match: string; owner: string }> = [];

interface Failure {
  scope: string;
  detail: string;
}

function git(cwd: string, args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function makeFixtureRepo(name: string, withRepoSpecs: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), `llman-sdd-e2e-${name}-`));
  if (withRepoSpecs) {
    cpSync(join(REPO_ROOT, 'llmanspec', 'specs'), join(dir, 'llmanspec', 'specs'), {
      recursive: true,
    });
    cpSync(join(REPO_ROOT, 'llmanspec', 'config.yaml'), join(dir, 'llmanspec', 'config.yaml'));
    if (existsSync(join(REPO_ROOT, 'llmanspec', 'theorems'))) {
      cpSync(join(REPO_ROOT, 'llmanspec', 'theorems'), join(dir, 'llmanspec', 'theorems'), {
        recursive: true,
      });
    }
  } else {
    mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
    writeFileSync(
      join(dir, 'llmanspec', 'specs', 'order-flow.feature'),
      [
        '# language: zh-CN',
        '# purpose: E2E 第二工作区样例',
        '',
        '功能: order-flow',
        '',
        '  @req:r1',
        '  规则: 订单状态机',
        '    订单 MUST 按合法状态流转。',
        '',
        '    @transitions',
        '    场景大纲: 订单主流程',
        '      假如 当前处于 <from> 状态',
        '      当 触发 <event> 事件',
        '      那么 流转至 <to> 状态',
        '',
        '      例子:',
        '        | from | event | to   |',
        '        | 草稿 | 提交  | 待审 |',
        '        | 待审 | 通过  | 完成 |',
        '',
      ].join('\n'),
    );
  }
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=e2e', '-c', 'user.email=e2e@local', 'commit', '-qm', 'fixture']);
  return dir;
}

/** Runs in the browser: collect geometry for the active canvas. */
async function collectSnapshot(page: Page): Promise<StudioGeometrySnapshot> {
  return page.evaluate(() => {
    const toRect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const nodeEls = [...document.querySelectorAll('.react-flow__node')].filter(
      (el) =>
        !el.classList.contains('react-flow__node-domainGroup') &&
        !el.classList.contains('react-flow__node-machineBoundary') &&
        visible(el),
    );
    const nodes = nodeEls.map((el) => ({ id: el.getAttribute('data-id') ?? '', ...toRect(el) }));
    const nearest = (p: { x: number; y: number }) => {
      let best = '';
      let bestD = Infinity;
      for (const n of nodes) {
        const dx = Math.max(n.x - p.x, 0, p.x - (n.x + n.width));
        const dy = Math.max(n.y - p.y, 0, p.y - (n.y + n.height));
        const d = Math.hypot(dx, dy);
        if (d < bestD) {
          bestD = d;
          best = n.id;
        }
      }
      return best;
    };
    const edges = [...document.querySelectorAll('.react-flow__edge')].flatMap((g, i) => {
      const path = g.querySelector<SVGPathElement>('path.react-flow__edge-path');
      if (!path) return [];
      const ctm = path.getScreenCTM();
      if (!ctm) return [];
      const total = path.getTotalLength();
      const steps = Math.max(8, Math.ceil(total / 6));
      const points = [];
      for (let k = 0; k <= steps; k += 1) {
        const p = path.getPointAtLength((total * k) / steps).matrixTransform(ctm);
        points.push({ x: p.x, y: p.y });
      }
      const first = points[0]!;
      const last = points[points.length - 1]!;
      return [
        {
          id: g.getAttribute('data-id') ?? `edge-${String(i)}`,
          source: nearest(first),
          target: nearest(last),
          points,
        },
      ];
    });
    const edgeLabels = [...document.querySelectorAll('[data-edge-label]')]
      .filter(visible)
      .map((el, i) => ({ id: `${el.textContent?.trim() ?? ''}#${String(i)}`, ...toRect(el) }));
    const groups = [...document.querySelectorAll('[data-group-members]')]
      .filter(visible)
      .map((el, i) => ({
        id: `group-${String(i)}`,
        memberIds: (el.getAttribute('data-group-members') ?? '').split(',').filter(Boolean),
        ...toRect(el),
      }));
    const topSlots = [...document.querySelectorAll('[data-top-slot]')].filter(visible).map(toRect);
    const minimapEl = document.querySelector('.react-flow__minimap');
    const drawerEl = document.querySelector('aside[aria-label="世界线抽屉"]');
    const triggerEl = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '世界线',
    );
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const el of clone.querySelectorAll(
      '.react-flow__node, [data-edge-label], .react-flow__edge, script, style, [data-user-content]',
    )) {
      el.remove();
    }
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      drawer: drawerEl && visible(drawerEl) ? toRect(drawerEl) : null,
      drawerTrigger: triggerEl ? toRect(triggerEl) : null,
      minimap: minimapEl && visible(minimapEl) ? toRect(minimapEl) : null,
      topSlots,
      nodes,
      edges,
      edgeLabels,
      groups,
      chromeText: clone.textContent ?? '',
    };
  });
}

function filterWaived(violations: StudioInvariantViolation[]): StudioInvariantViolation[] {
  return violations.filter(
    (v) => !KNOWN_WAIVERS.some((w) => w.invariant === v.invariant && v.detail.includes(w.match)),
  );
}

async function settle(page: Page, ms = 700): Promise<void> {
  await page.waitForTimeout(ms);
}

async function nodePositions(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const el of document.querySelectorAll<HTMLElement>('.react-flow__node')) {
      out[el.getAttribute('data-id') ?? ''] = el.style.transform;
    }
    return out;
  });
}

async function runViewport(
  browser: Browser,
  hub: RunningStudioHub,
  secondWsKey: string,
  viewport: { width: number; height: number },
): Promise<Failure[]> {
  const tag = `${String(viewport.width)}x${String(viewport.height)}`;
  const failures: Failure[] = [];
  const fail = (scope: string, detail: string) =>
    failures.push({ scope: `${tag} ${scope}`, detail });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const wsUrl = `${hub.url}/p/${encodeURIComponent(hub.activeWsKey)}`;

  const judge = async (scope: string) => {
    const snap = await collectSnapshot(page);
    for (const v of filterWaived(checkStudioInvariants(snap)))
      fail(scope, `[${v.invariant}] ${v.detail}`);
    return snap;
  };

  try {
    // ── Main view ──
    await page.goto(wsUrl);
    await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
    await settle(page, 1200);
    const main = await judge('main-view');
    if (main.nodes.length === 0) fail('main-view', 'no spec cards rendered');
    const miniNodes = await page.locator('.react-flow__minimap .react-flow__minimap-node').count();
    if (main.minimap && miniNodes === 0) fail('main-view', 'minimap renders no node preview');

    const ctxPrevented = await page.evaluate(() => {
      const target = document.querySelector('.react-flow__pane') ?? document.body;
      const ev = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 300,
        clientY: 300,
      });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    if (!ctxPrevented) fail('main-view', 'native browser context menu is not suppressed');
    await settle(page, 150);
    await page.keyboard.press('Escape');
    await settle(page, 150);

    // ── ? shortcut cheat sheet modal opens cleanly and closes on Escape (r157) ──
    await page.keyboard.press('Shift+/');
    await settle(page, 250);
    const shortcutDialogCount = await page
      .locator('div[role="dialog"][aria-label="快捷键速查卡"]')
      .count();
    if (shortcutDialogCount !== 1) {
      fail('shortcuts', '? key did not open shortcut cheat sheet modal');
    }
    await page.keyboard.press('Escape');
    await settle(page, 200);
    if ((await page.locator('div[role="dialog"][aria-label="快捷键速查卡"]').count()) !== 0) {
      fail('shortcuts', 'Escape did not close shortcut cheat sheet modal');
    }

    // ── Ctrl+F in-panel find bar opens cleanly, matches cards, and does not violate top-slot exclusivity (r159) ──
    await page.keyboard.press('Control+f');
    await settle(page, 250);
    const findBar = page.locator('div[role="search"][aria-label="面板内搜索"]');
    if ((await findBar.count()) !== 1) {
      fail('in-panel-find', 'Ctrl+F did not open in-panel find bar');
    } else {
      await findBar.locator('input').fill('studio');
      await settle(page, 200);
      await judge('main-view+find');
      await page.keyboard.press('Escape');
      await settle(page, 150);
    }

    // ── Read-only Human Theorems drawer opens right-side cleanly without overlapping minimap (r162) ──
    const theoremBtn = page.locator('button[title*="人类定理"]').first();
    if ((await theoremBtn.count()) > 0) {
      await theoremBtn.click();
      await settle(page, 250);
      if ((await page.locator('aside[aria-label="人类定理抽屉"]').count()) !== 1) {
        fail('theorems-drawer', 'Theorems drawer did not open');
      }
      await page.keyboard.press('Escape');
      await settle(page, 200);
    }

    // ── Drag a node right (React #185 regression) + persistence across refresh ──
    const card = page.locator('.react-flow__node:not(.react-flow__node-domainGroup)').last();
    const cardId = await card.getAttribute('data-id');
    const box = await card.boundingBox();
    if (box && cardId) {
      await page.mouse.move(box.x + box.width / 2, box.y + 12);
      await page.mouse.down();
      for (let k = 1; k <= 10; k += 1)
        await page.mouse.move(box.x + box.width / 2 + k * 16, box.y + 12);
      await page.mouse.up();
      await settle(page);
      if (pageErrors.length > 0) fail('drag-node', `page errors: ${pageErrors.join(' | ')}`);
      if ((await page.locator('.react-flow__node').count()) === 0)
        fail('drag-node', 'canvas went blank');
      const before = (await nodePositions(page))[cardId];
      // Workspace switch → back, then hard refresh: change must survive both.
      await page.goto(`${hub.url}/p/${encodeURIComponent(secondWsKey)}`);
      await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
      await page.goto(wsUrl);
      await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
      await settle(page);
      await page.reload();
      await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
      await settle(page);
      const after = (await nodePositions(page))[cardId];
      if (before !== after)
        fail('persistence', `node ${cardId} moved ${String(before)} -> ${String(after)}`);
    } else {
      fail('drag-node', 'no draggable spec card found');
    }

    // ── studio-web state machine tab ──
    const boot = (await (
      await fetch(`${hub.url}/api/p/${encodeURIComponent(hub.activeWsKey)}/bootstrap`)
    ).json()) as {
      specs?: Array<{ id: string; machineKeys?: string[] }>;
    };
    const machineKey = boot.specs?.find((s) => s.id === 'studio-web')?.machineKeys?.[0];
    if (machineKey) {
      await page.goto(`${wsUrl}?kind=machine&target=${encodeURIComponent(machineKey)}`);
      await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
      await settle(page, 1200);
      await judge('state-machine');
      // Axiom 4: drag an edge label and verify its adjusted position stays shifted
      const edgeLbl = page.locator('[data-edge-label]').first();
      const lblBoxBefore = await edgeLbl.boundingBox();
      if (lblBoxBefore) {
        await page.mouse.move(
          lblBoxBefore.x + lblBoxBefore.width / 2,
          lblBoxBefore.y + lblBoxBefore.height / 2,
        );
        await page.mouse.down();
        for (let k = 1; k <= 6; k += 1) {
          await page.mouse.move(
            lblBoxBefore.x + lblBoxBefore.width / 2,
            lblBoxBefore.y + lblBoxBefore.height / 2 + k * 8,
          );
        }
        await page.mouse.up();
        await settle(page);
        const lblBoxAfter = await edgeLbl.boundingBox();
        if (
          !lblBoxAfter ||
          Math.hypot(lblBoxAfter.x - lblBoxBefore.x, lblBoxAfter.y - lblBoxBefore.y) < 6
        ) {
          fail('edge-label-drag', 'dragging edge label did not persist bend offset');
        }
      }
      const trigger = page.locator('button', { hasText: /^世界线$/u }).first();
      if ((await trigger.count()) > 0) {
        await trigger.click();
        await settle(page);
        const withDrawer = await judge('state-machine+worldline');
        if (!withDrawer.drawer) fail('state-machine+worldline', 'worldline drawer did not open');
      } else {
        fail('state-machine', 'worldline trigger button not found');
      }
    } else {
      fail('state-machine', 'studio-web machineKey missing from bootstrap');
    }

    // ── New tab start page: click `+` button and assert no floating top-slot bars ──
    const newTabBtn = page.locator('button[title*="打开新标签页"]').first();
    if ((await newTabBtn.count()) > 0) {
      await newTabBtn.click();
      await settle(page);
      const startPage = await collectSnapshot(page);
      if (startPage.topSlots.length > 0) {
        fail('new-tab', 'floating top-slot bar visible on start page');
      }
    } else {
      fail('new-tab', 'new-tab (+) button not found');
    }

    if (pageErrors.length > 0) fail('page', `uncaught page errors: ${pageErrors.join(' | ')}`);
    if (failures.length > 0) {
      mkdirSync(ARTIFACT_DIR, { recursive: true });
      await page.screenshot({ path: join(ARTIFACT_DIR, `failure-${tag}.png`), fullPage: true });
    }
  } finally {
    await context.close();
  }
  return failures;
}

async function main(): Promise<number> {
  const fixtures = [makeFixtureRepo('primary', true), makeFixtureRepo('secondary', false)];
  let browser: Browser | null = null;
  let hub: RunningStudioHub | null = null;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (err) {
      console.error(
        `[qa-studio-e2e] Chromium for playwright-core is not installed: ${(err as Error).message.split('\n')[0]}`,
      );
      console.error('[qa-studio-e2e] install with: bunx playwright-core install chromium');
      return 2;
    }
    hub = await startStudioHub({
      initialDirectory: fixtures[0]!,
      port: 0,
      writeHubFile: false,
      studioDistDir: DIST_DIR,
    });
    const second = hub.registerWorkspace(fixtures[1]!);
    const all: Failure[] = [];
    for (const vp of VIEWPORTS) all.push(...(await runViewport(browser, hub, second.wsKey, vp)));
    if (all.length > 0) {
      console.error(`[qa-studio-e2e] ${String(all.length)} invariant violation(s):`);
      for (const f of all) console.error(`  - ${f.scope}: ${f.detail}`);
      console.error(`[qa-studio-e2e] screenshots: ${ARTIFACT_DIR}`);
      return 1;
    }
    console.log(
      `[pass] qa-studio-e2e (${String(VIEWPORTS.length)} viewports, 6 axioms + regressions)`,
    );
    return 0;
  } finally {
    await browser?.close();
    await hub?.close();
    for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
  }
}

process.exitCode = await main();
