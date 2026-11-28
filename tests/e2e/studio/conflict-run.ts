#!/usr/bin/env bun
// Real-browser E2E for studio-web r165/r166 user paths (file-sync dock, picks, activity, 409).
// Invoked after visual invariants by `just qa-studio-e2e` (aggregated by `just qa`).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  addStudioComment,
  cloneMachineDraft,
  cloneMachineIR,
  createStudioStateDoc,
  extractStudioMachines,
  parseCapability,
  writeStudioState,
  type SpecEntry,
  type StudioMachineIR,
  type StudioStateDoc,
} from '@llman-sdd/core';
import { chromium, type Browser, type Locator, type Page } from 'playwright-core';

import { makeNodeStudioStateIo } from '../../../apps/cli/src/commands/studioShared.ts';
import {
  startStudioHub,
  type RunningStudioHub,
} from '../../../apps/cli/src/studio-server/server.ts';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DIST_DIR = join(REPO_ROOT, 'apps', 'studio', 'dist');
const ARTIFACT_DIR = join(REPO_ROOT, '.llman-sdd', 'e2e-artifacts');
const SPEC_REL = 'llmanspec/specs/order-flow.feature';
const FORBIDDEN = [
  'BASE',
  'LOCAL',
  'REMOTE',
  'baseHash',
  'stale',
  '409',
  'SSE',
  '你刚画的',
] as const;

const BASE_ROWS = `| from | event | to   |
        | 草稿 | 提交  | 待审 |
        | 待审 | 通过  | 完成 |`;

const THEIRS_ROWS = `${BASE_ROWS}
        | 待审 | 加急  | 完成 |`;

const GUARD_BASE_ROWS = `| from | event | guard | to   |
        | 待审 | 通过  |       | 完成 |`;

const GUARD_THEIRS_ROWS = `| from | event | guard | to   |
        | 待审 | 通过  | 加急  | 完成 |`;

type Failure = { scope: string; detail: string };
type SeedKind = 'clean' | 'stale' | 'guard-clash';

function git(cwd: string, args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function featureSource(rows: string, withGuard: boolean): string {
  const steps = withGuard
    ? [
        '      假如 当前处于 <from> 状态且满足 <guard>',
        '      当 触发 <event> 事件',
        '      那么 流转至 <to> 状态',
      ]
    : [
        '      假如 当前处于 <from> 状态',
        '      当 触发 <event> 事件',
        '      那么 流转至 <to> 状态',
      ];
  return [
    '# language: zh-CN',
    '# purpose: E2E 订单主流程冲突夹具',
    '',
    '功能: order-flow',
    '',
    '  @req:r1',
    '  规则: 订单状态机',
    '    订单 MUST 按合法状态流转。',
    '',
    '    @transitions',
    '    场景大纲: 订单主流程',
    ...steps,
    '',
    '      例子:',
    `        ${rows}`,
    '',
  ].join('\n');
}

function extractDraft(src: string): ReturnType<typeof extractStudioMachines>[0]['draft'] {
  const entry: SpecEntry = {
    fileName: SPEC_REL,
    specId: 'order-flow',
    doc: parseCapability(src, SPEC_REL),
  };
  const extracted = extractStudioMachines([entry])[0];
  if (!extracted) throw new Error('extractStudioMachines returned no draft');
  return extracted.draft;
}

function addOursEdits(machine: StudioMachineIR): StudioMachineIR {
  const next = cloneMachineIR(machine);
  next.states.push({ uid: 's-cancel', name: '已取消' });
  const pending = next.states.find((s) => s.name === '待审');
  const draft = next.states.find((s) => s.name === '草稿');
  if (!pending || !draft) throw new Error('expected 待审 and 草稿');
  next.transitions.push({
    uid: 'e-reject',
    fromUid: pending.uid,
    event: '驳回',
    toUid: draft.uid,
  });
  return next;
}

function setPassGuard(machine: StudioMachineIR, guard: string): StudioMachineIR {
  const next = cloneMachineIR(machine);
  const edge = next.transitions.find((t) => t.event === '通过');
  if (!edge) throw new Error('expected 通过 transition');
  edge.guard = guard;
  return next;
}

function seedRepo(kind: SeedKind): string {
  const dir = mkdtempSync(join(tmpdir(), `llman-sdd-e2e-conflict-${kind}-`));
  mkdirSync(join(dir, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(dir, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: zh-Hans\n');
  const withGuard = kind === 'guard-clash';
  const baseSrc = featureSource(withGuard ? GUARD_BASE_ROWS : BASE_ROWS, withGuard);
  writeFileSync(join(dir, SPEC_REL), baseSrc);
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.name=e2e', '-c', 'user.email=e2e@local', 'commit', '-qm', 'base']);

  const draft = cloneMachineDraft(extractDraft(baseSrc));
  if (kind === 'stale' && draft.current) draft.current = addOursEdits(draft.current);
  if (kind === 'guard-clash' && draft.current)
    draft.current = setPassGuard(draft.current, '金额>100');
  let doc: StudioStateDoc = createStudioStateDoc({
    id: 'workspace-draft',
    title: 'conflict e2e',
    createdAt: '2026-11-28T00:00:00.000Z',
    drafts: [draft],
  });
  doc = { ...doc, baseHashes: { [SPEC_REL]: sha256(baseSrc) } };
  if (kind === 'stale') {
    const mk = draft.current?.machineKey;
    const uid = draft.current?.states[0]?.uid;
    if (mk && uid) {
      doc = addStudioComment(doc, {
        anchor: { kind: 'state', machineKey: mk, stateUid: uid },
        author: 'agent',
        body: '请核对草稿节点',
        createdAt: '2026-11-28T00:01:00.000Z',
      });
    }
  }
  writeStudioState(makeNodeStudioStateIo(dir), doc);

  if (kind === 'stale') writeFileSync(join(dir, SPEC_REL), featureSource(THEIRS_ROWS, false));
  if (kind === 'guard-clash') {
    writeFileSync(join(dir, SPEC_REL), featureSource(GUARD_THEIRS_ROWS, true));
  }
  return dir;
}

async function settle(page: Page, ms = 500): Promise<void> {
  await page.waitForTimeout(ms);
}

function failPush(failures: Failure[], scope: string, detail: string): void {
  failures.push({ scope, detail });
}

function jargonHits(text: string): string[] {
  return FORBIDDEN.filter((word) => text.includes(word));
}

async function openMachine(page: Page, hub: RunningStudioHub): Promise<string> {
  const boot = (await (
    await fetch(`${hub.url}/api/p/${encodeURIComponent(hub.activeWsKey)}/bootstrap`)
  ).json()) as { specs?: Array<{ machineKeys?: string[] }> };
  const machineKey = boot.specs?.[0]?.machineKeys?.[0];
  if (!machineKey) throw new Error('fixture machineKey missing from bootstrap');
  const wsUrl = `${hub.url}/p/${encodeURIComponent(hub.activeWsKey)}`;
  await page.goto(`${wsUrl}?kind=machine&target=${encodeURIComponent(machineKey)}`);
  await page.waitForSelector('.react-flow__node', { timeout: 15_000 });
  await settle(page, 900);
  return machineKey;
}

async function waitDock(page: Page): Promise<Locator> {
  const dock = page.locator('[data-conflict-dock]');
  await dock.waitFor({ state: 'visible', timeout: 10_000 });
  return dock;
}

async function visibleText(page: Page): Promise<string> {
  return page.locator('body').innerText();
}

async function confirmSync(page: Page): Promise<void> {
  const wait = page.waitForResponse(
    (res) => res.url().includes('sync-apply') && res.request().method() === 'POST',
    { timeout: 10_000 },
  );
  await page.getByRole('button', { name: '做完了' }).click();
  const res = await wait;
  if (!res.ok()) throw new Error(`sync-apply ${String(res.status())}`);
  await page.locator('[data-conflict-dock]').waitFor({ state: 'detached', timeout: 8_000 });
  await settle(page, 600);
}

async function runWithHub(
  browser: Browser,
  kind: SeedKind,
  fn: (page: Page, hub: RunningStudioHub, root: string) => Promise<void>,
): Promise<Failure[]> {
  const failures: Failure[] = [];
  const root = seedRepo(kind);
  let hub: RunningStudioHub | null = null;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  try {
    hub = await startStudioHub({
      initialDirectory: root,
      port: 0,
      writeHubFile: false,
      studioDistDir: DIST_DIR,
    });
    await fn(page, hub, root);
  } catch (err) {
    failPush(failures, kind, err instanceof Error ? err.message : String(err));
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: join(ARTIFACT_DIR, `conflict-${kind}.png`), fullPage: true });
  } finally {
    if (pageErrors.length > 0) {
      failPush(failures, kind, `uncaught page errors: ${pageErrors.join(' | ')}`);
    }
    await context.close();
    await hub?.close();
    rmSync(root, { recursive: true, force: true });
  }
  return failures;
}

async function scenarioClean(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'clean', async (page, hub) => {
    await openMachine(page, hub);
    if ((await page.locator('[data-conflict-dock]').count()) !== 0) {
      throw new Error('conflict dock shown when files are not stale');
    }
  });
}

async function scenarioEnterSync(browser: Browser): Promise<Failure[]> {
  const failures: Failure[] = [];
  const extra = await runWithHub(browser, 'stale', async (page, hub) => {
    await openMachine(page, hub);
    const dock = await waitDock(page);
    const dockText = await dock.innerText();
    for (const needle of [
      '规格在别处改过了',
      '这份规格在别处被改过了。你在画布上的修改还在。',
      '你在本画布的调整',
      '文件里新来的',
      '做完了',
      '本画布',
      '文件',
      '已取消',
      '驳回',
      '加急',
    ]) {
      if (!dockText.includes(needle)) throw new Error(`dock missing “${needle}”`);
    }
    const hits = jargonHits(dockText);
    if (hits.length > 0) throw new Error(`forbidden jargon in dock: ${hits.join(', ')}`);
    if ((await page.locator('[data-top-slot]').count()) > 1) {
      throw new Error('top-center slot exceeded 1 while conflict dock is open');
    }
    const dockBox = await dock.boundingBox();
    const saveBox = await page.getByRole('button', { name: '保存变更' }).boundingBox();
    if (!dockBox || !saveBox) throw new Error('dock or save button has no box');
    if (dockBox.y < 280) throw new Error('conflict dock is not above the operation bar');
    if (dockBox.y + dockBox.height > saveBox.y + 12) {
      throw new Error('conflict dock overlaps the operation bar');
    }
    const pulses = await page.locator('[data-sync-pulse]').count();
    if (pulses < 2) throw new Error(`expected pulsing chart regions, got ${String(pulses)}`);
    await page
      .getByRole('button', { name: /世界线/u })
      .first()
      .click();
    await settle(page, 300);
    const drawer = page.locator('aside[aria-label="世界线抽屉"]');
    await drawer.waitFor({ state: 'visible' });
    const drawerText = await drawer.innerText();
    if (!drawerText.includes('刚才在画布上的版本')) {
      throw new Error('worldline missing snapshot cell 刚才在画布上的版本');
    }
    if (drawerText.includes('BASE')) {
      throw new Error('worldline still shows internal BASE id');
    }
    await page.keyboard.press('Escape');
  });
  failures.push(...extra);
  return failures;
}

async function scenarioPicksAndFocus(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'stale', async (page, hub) => {
    await openMachine(page, hub);
    await waitDock(page);
    const oursEmpty = page.getByRole('button', { name: '你在本画布的调整：没有' });
    const theirsEmpty = page.getByRole('button', { name: '文件里新来的：没有' });
    if ((await oursEmpty.count()) < 1 || (await theirsEmpty.count()) < 1) {
      throw new Error('expected empty-side wells for ours-only / theirs-only items');
    }
    await page.getByRole('button', { name: '你在本画布的调整：已取消' }).click();
    await settle(page, 400);
    const focusPulse = await page.locator('[data-sync-pulse="focus"]').count();
    if (focusPulse < 1) throw new Error('clicking a pick did not focus-pulse the chart');
    const keepBoth = page.getByRole('button', { name: '两条都留' });
    if ((await keepBoth.count()) !== 0) {
      throw new Error('keep-both shown for one-sided items');
    }
    const toggle = page.getByRole('button', { name: '逐条看看' });
    await toggle.click();
    await settle(page, 200);
    if ((await page.getByRole('button', { name: '你在本画布的调整：已取消' }).count()) !== 0) {
      throw new Error('collapse did not hide pick cards');
    }
    await toggle.click();
    await settle(page, 200);
    if ((await page.getByRole('button', { name: '你在本画布的调整：已取消' }).count()) === 0) {
      throw new Error('expand did not restore pick cards');
    }
  });
}

async function scenarioBulkCanvas(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'stale', async (page, hub, root) => {
    await openMachine(page, hub);
    await waitDock(page);
    const specBefore = readFileSync(join(root, SPEC_REL), 'utf8');
    await page.getByRole('button', { name: '先留我刚改的' }).click();
    await confirmSync(page);
    const text = await visibleText(page);
    if (!text.includes('已取消')) throw new Error('bulk 本画布 dropped canvas-only 已取消');
    if (text.includes('加急')) throw new Error('bulk 本画布 imported disk 加急');
    if (readFileSync(join(root, SPEC_REL), 'utf8') !== specBefore) {
      throw new Error('做完了 wrote llmanspec/specs/');
    }
  });
}

async function scenarioBulkFile(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'stale', async (page, hub, root) => {
    await openMachine(page, hub);
    await waitDock(page);
    const specBefore = readFileSync(join(root, SPEC_REL), 'utf8');
    await page.getByRole('button', { name: '先用文件里的' }).click();
    await confirmSync(page);
    const text = await visibleText(page);
    if (text.includes('已取消')) throw new Error('bulk 文件 kept canvas-only 已取消');
    if (!text.includes('加急')) throw new Error('bulk 文件 did not take disk 加急');
    if (readFileSync(join(root, SPEC_REL), 'utf8') !== specBefore) {
      throw new Error('做完了 wrote llmanspec/specs/');
    }
  });
}

async function scenarioMixedPicks(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'stale', async (page, hub) => {
    await openMachine(page, hub);
    await waitDock(page);
    await page.getByRole('button', { name: '你在本画布的调整：已取消' }).click();
    await page.getByRole('button', { name: /你在本画布的调整：.*驳回/u }).click();
    await page.getByRole('button', { name: /文件里新来的：.*加急/u }).click();
    await confirmSync(page);
    const text = await visibleText(page);
    if (!text.includes('已取消') || !text.includes('驳回') || !text.includes('加急')) {
      throw new Error(`mixed picks did not keep both sides: ${text.slice(0, 240)}`);
    }
  });
}

async function scenarioActivityAndComment(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'stale', async (page, hub) => {
    await openMachine(page, hub);
    await waitDock(page);
    await settle(page, 400);
    const badge = page.getByRole('button', { name: /还有人在改/u });
    await badge.waitFor({ state: 'visible', timeout: 8_000 });
    hub.broadcastEvent({
      type: 'state-updated',
      wsKey: hub.activeWsKey,
      stateId: 'workspace-draft',
      revision: 9,
      originClientId: 'other-tab',
    });
    await settle(page, 600);
    await badge.waitFor({ state: 'visible', timeout: 8_000 });
    if ((await page.locator('[data-top-slot]').count()) > 1) {
      throw new Error('activity badge promoted to a second top-slot banner');
    }
    await badge.click();
    await settle(page, 200);
    const body = await page.locator('body').innerText();
    if (!body.includes('另一处工作区刚保存了这份规格')) {
      throw new Error('activity list missing peer-save copy');
    }
    if (!body.includes('有人在「') || !body.includes('留下了看法')) {
      throw new Error('activity list missing agent-comment copy');
    }
    if (body.includes('@agent')) throw new Error('production chrome contains @agent');

    const node = page.locator('.react-flow__node').filter({ hasText: '草稿' }).first();
    const box = await node.boundingBox();
    if (!box) throw new Error('草稿 node missing');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await settle(page, 250);
    await page.getByText('留评论', { exact: true }).click();
    await settle(page, 250);
    const watch = page.getByText('请谁看', { exact: true });
    if ((await watch.count()) === 0) throw new Error('comment popover missing 请谁看');
    const promptBtn = page.getByRole('button', { name: '只带我勾的看法' });
    if ((await promptBtn.count()) === 0) throw new Error('missing 只带我勾的看法');
  });
}

async function scenarioTabRevision409(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'stale', async (page, hub) => {
    await openMachine(page, hub);
    await waitDock(page);
    await settle(page, 800);
    const node = page.locator('.react-flow__node').filter({ hasText: '草稿' }).first();
    await node.dblclick();
    const editor = page.locator('.inline-canvas-editor input');
    await editor.waitFor({ state: 'visible', timeout: 4_000 });
    await editor.fill('草稿X');
    await editor.press('Enter');
    const boot = (await (
      await fetch(`${hub.url}/api/p/${encodeURIComponent(hub.activeWsKey)}/bootstrap`)
    ).json()) as { token: string; stateDoc: StudioStateDoc };
    const put = await fetch(
      `${hub.url}/api/p/${encodeURIComponent(hub.activeWsKey)}/states/${encodeURIComponent(boot.stateDoc.id)}`,
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          'x-studio-token': boot.token,
          'x-studio-client-id': 'other-tab',
          'if-match': String(boot.stateDoc.revision ?? 0),
        },
        body: JSON.stringify({
          doc: boot.stateDoc,
          expectedRevision: boot.stateDoc.revision ?? 0,
        }),
      },
    );
    if (!put.ok) throw new Error(`peer PUT failed ${String(put.status)} ${await put.text()}`);
    await settle(page, 1200);
    const chrome = await page.locator('body').innerText();
    if (!chrome.includes('另一扇窗口刚保存了这份草稿')) {
      throw new Error('409 path did not show 另一扇窗口刚保存了这份草稿');
    }
    if (!chrome.includes('这份规格在别处被改过了')) {
      throw new Error('file-sync copy disappeared after tab-revision 409');
    }
  });
}

async function scenarioGuardClash(browser: Browser): Promise<Failure[]> {
  return runWithHub(browser, 'guard-clash', async (page, hub) => {
    await openMachine(page, hub);
    const dock = await waitDock(page);
    const text = await dock.innerText();
    if (!text.includes('这两条是同一件事，请选留哪一条')) {
      throw new Error('guard clash missing 同一件事 copy');
    }
    if (!text.includes('或')) {
      throw new Error('guard clash missing exclusive 或 marker');
    }
    if ((await page.getByRole('button', { name: '两条都留' }).count()) !== 0) {
      throw new Error('keep-both offered on signature clash');
    }
  });
}

async function main(): Promise<number> {
  let browser: Browser | null = null;
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
    const all: Failure[] = [];
    const cases: Array<[string, (b: Browser) => Promise<Failure[]>]> = [
      ['clean', scenarioClean],
      ['enter-sync', scenarioEnterSync],
      ['picks-focus', scenarioPicksAndFocus],
      ['bulk-canvas', scenarioBulkCanvas],
      ['bulk-file', scenarioBulkFile],
      ['mixed-picks', scenarioMixedPicks],
      ['activity-comment', scenarioActivityAndComment],
      ['tab-409', scenarioTabRevision409],
      ['guard-clash', scenarioGuardClash],
    ];
    for (const [name, run] of cases) {
      const found = await run(browser);
      for (const f of found) all.push({ scope: name, detail: `${f.scope}: ${f.detail}` });
    }
    if (all.length > 0) {
      console.error(`[qa-studio-e2e] conflict paths: ${String(all.length)} failure(s):`);
      for (const f of all) console.error(`  - ${f.scope}: ${f.detail}`);
      console.error(`[qa-studio-e2e] screenshots: ${ARTIFACT_DIR}`);
      return 1;
    }
    console.log(`[pass] qa-studio-e2e conflict paths (${String(cases.length)} user situations)`);
    return 0;
  } finally {
    await browser?.close();
  }
}

process.exitCode = await main();
