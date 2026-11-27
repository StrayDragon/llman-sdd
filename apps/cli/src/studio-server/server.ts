/**
 * Hono + @hono/node-server local Studio Hub (studio-web r144, r145, r147).
 * - Pure Web Standard Request/Response + node:* (zero Bun.* APIs, dual-runtime compliant)
 * - Shared Zod v4 contracts from @llman-sdd/core
 * - Loopback security, lazy spec loading, optimistic revision locking, SSE with .git/HEAD & echo filter
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from 'node:fs';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { basename, dirname, join, relative, resolve } from 'node:path';

import { serve, type ServerType } from '@hono/node-server';
import {
  acceptRevisionProposal,
  buildDemoStudioDrafts,
  buildDemoStudioWebDrafts,
  buildForestGraph,
  buildProposalDraft,
  buildWorkspaceSearchDocuments,
  computeMachineDiff,
  createStudioStateDoc,
  currentBranch,
  defaultBranch,
  detectConvertibleStructure,
  discoverRoots,
  discoverSpecs,
  exportProposalRequestSchema,
  extractDecisionTables,
  extractStudioMachines,
  foldFeatureAst,
  foldPlainText,
  formatSemanticDiff,
  graphMermaid,
  listStudioStates,
  makeSpawnGit,
  parseCapability,
  previewFeatureUnifiedDiff,
  putLayoutRequestSchema,
  putStateRequestSchema,
  putViewsRequestSchema,
  readStudioState,
  readStudioViews,
  registerWorkspaceRequestSchema,
  rejectRevisionProposal,
  renderUpdatedFeatureSource,
  resolveInstanceRoot,
  ruleHasRunnableScenario,
  searchWorkspaceBm25,
  specIdOf,
  studioSearchRequestSchema,
  textfoldRequestSchema,
  validateStateId,
  worktreeList,
  writeStudioState,
  writeStudioViews,
  type BootstrapResponse,
  type HealthResponse,
  type SpecDetailResponse,
  type StudioSearchHit,
  type StudioSearchResponse,
  type SpecEntry,
  type SpecIndexEdge,
  type SpecIndexItem,
  type StudioFocusContext,
  type StudioSseEvent,
  type StudioStateDoc,
  type TextfoldResponse,
  type WorkspaceItem,
} from '@llman-sdd/core';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import { makeNodeStudioStateIo } from '../commands/studioShared.ts';
import { makeIo } from '../io.ts';
import {
  defaultHubFilePath,
  formatLoopbackUrl,
  isLoopbackHost,
  removeHubInfoFile,
  writeHubInfoFile,
} from './hub.ts';
import { renderNegotiatedMarkdown, resolveNegotiatedFormat } from './negotiate.ts';
import { createLoopbackSecurityMiddleware, generateStudioToken } from './security.ts';
import { loadStudioAsset, renderSpaHtmlWithFocus } from './static.ts';

export interface StudioHubOptions {
  initialDirectory: string;
  host?: string;
  port?: number;
  demo?: boolean;
  version?: string;
  hubFilePath?: string;
  writeHubFile?: boolean;
  studioDistDir?: string;
}

export interface RunningStudioHub {
  app: Hono;
  host: string;
  port: number;
  url: string;
  token: string;
  activeWsKey: string;
  registerWorkspace: (directory: string) => WorkspaceItem;
  broadcastEvent: (event: StudioSseEvent) => void;
  close: () => Promise<void>;
}

interface WorkspaceRecord {
  item: WorkspaceItem;
  demoMode: boolean;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

let atomicWriteSeq = 0;

function makeWsKey(repo: string, branch: string, instanceRel: string): string {
  const safeBranch = branch.replaceAll(/[^\w.-]+/gu, '-').replace(/\.+$/u, '') || 'branch';
  const safeRel =
    instanceRel === '' || instanceRel === '.'
      ? 'root'
      : instanceRel.replaceAll('\\', '/').replaceAll('/', '_').replace(/\.+$/u, '') || 'root';
  return `${repo}@${safeBranch}@${safeRel}`;
}

function resolveGitDir(worktreePath: string): string | null {
  const dotGit = join(worktreePath, '.git');
  if (!existsSync(dotGit)) return null;
  try {
    const st = statSync(dotGit);
    if (st.isDirectory()) return dotGit;
    if (st.isFile()) {
      const content = readFileSync(dotGit, 'utf8').trim();
      const m = /^gitdir:\s*(.+)$/mu.exec(content);
      if (m?.[1]) return resolve(dirname(dotGit), m[1].trim());
    }
  } catch {
    return null;
  }
  return null;
}

function isProtectedBranchName(branch: string, defBranch: string): boolean {
  return branch === defBranch || branch === 'main' || branch === 'master';
}

function discoverWorkspaceRecord(directory: string, demoMode: boolean): WorkspaceRecord {
  const absDir = resolve(directory);
  const io = makeIo(absDir);
  const instanceRoot = resolveInstanceRoot(absDir, io) ?? absDir;
  const git = makeSpawnGit(instanceRoot);
  let branch = 'main';
  let defBranch = 'main';
  let repoRoot = instanceRoot;
  try {
    branch = currentBranch(git) || 'main';
    defBranch = defaultBranch(git) || 'main';
    const wts = worktreeList(git);
    if (wts[0]?.path) repoRoot = wts[0].path;
  } catch {
    // Non-git directory fallback
  }
  const repo = basename(repoRoot) || 'workspace';
  const relRaw = relative(repoRoot, instanceRoot).replaceAll('\\', '/');
  const instanceRel = relRaw === '' || relRaw.startsWith('..') ? '.' : relRaw;
  const specIo = makeIo(instanceRoot);
  const entries = discoverSpecs('llmanspec/specs', specIo);
  const wsKey = makeWsKey(repo, branch, instanceRel);
  return {
    item: {
      wsKey,
      repo,
      branch,
      worktreePath: repoRoot,
      instanceRoot,
      instanceRel,
      protected: isProtectedBranchName(branch, defBranch),
      specCount: entries.length,
    },
    demoMode,
  };
}

function discoverPeerWorktrees(ws: WorkspaceItem): WorkspaceItem[] {
  const peers: WorkspaceItem[] = [];
  try {
    const git = makeSpawnGit(ws.instanceRoot);
    const defBranch = defaultBranch(git) || 'main';
    const wts = worktreeList(git);
    for (const wt of wts) {
      if (resolve(wt.path) === resolve(ws.worktreePath)) continue;
      const targetRoot = ws.instanceRel === '.' ? wt.path : join(wt.path, ws.instanceRel);
      if (!existsSync(targetRoot)) continue;
      const br = wt.branch || 'detached';
      const entries = discoverSpecs('llmanspec/specs', makeIo(targetRoot));
      peers.push({
        wsKey: makeWsKey(ws.repo, br, ws.instanceRel),
        repo: ws.repo,
        branch: br,
        worktreePath: wt.path,
        instanceRoot: targetRoot,
        instanceRel: ws.instanceRel,
        protected: isProtectedBranchName(br, defBranch),
        specCount: entries.length,
      });
    }
  } catch {
    // Ignore non-git repos
  }
  return peers;
}

function readSpecSource(instanceRoot: string, fileName: string): string {
  const abs = resolve(instanceRoot, fileName);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
}

function buildSpecIndex(
  instanceRoot: string,
  entries: readonly SpecEntry[],
  stateDoc: StudioStateDoc,
): {
  specs: SpecIndexItem[];
  edges: SpecIndexEdge[];
  staleFiles: string[];
} {
  const forest = buildForestGraph(entries);
  const staleFiles: string[] = [];

  const specs: SpecIndexItem[] = forest.nodes.map((node) => {
    const rawSource = readSpecSource(instanceRoot, node.file);
    const expectedHash = stateDoc.baseHashes?.[node.file];
    const stale = expectedHash !== undefined && expectedHash !== sha256Hex(rawSource);
    if (stale) staleFiles.push(node.file);
    return {
      id: node.id,
      title: node.title,
      file: node.file,
      kind: node.kind,
      hardness: node.hardness,
      ruleCount: node.ruleCount,
      scenarioCount: node.scenarioCount,
      decisionTableCount: node.decisionTableCount,
      machineKeys: node.machineKeys,
      summary: node.summary,
      reqPreview: node.reqPreview,
      tags: node.tags,
      stale,
    };
  });

  const edges: SpecIndexEdge[] = forest.edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    label: e.label,
    kind: e.kind,
    evidence: e.evidence,
  }));

  return { specs, edges, staleFiles };
}

function mergeColdLayouts(instanceRoot: string, doc: StudioStateDoc): StudioStateDoc {
  const dir = join(instanceRoot, '.llman-sdd', 'studio', 'layouts');
  if (!existsSync(dir)) return doc;
  const layouts: StudioStateDoc['layouts'] = { ...doc.layouts };
  const edgeBends: NonNullable<StudioStateDoc['edgeBends']> = { ...doc.edgeBends };
  let changed = false;
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json') || file.startsWith('.')) continue;
      try {
        const parsed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
          machineKey?: string;
          positions?: Record<string, { x: number; y: number }>;
          edgeBends?: Record<string, { dx: number; dy: number }>;
        };
        if (typeof parsed.machineKey !== 'string' || parsed.machineKey === '') continue;
        if (parsed.positions && typeof parsed.positions === 'object') {
          layouts[parsed.machineKey] = {
            ...layouts[parsed.machineKey],
            ...parsed.positions,
          };
          changed = true;
        }
        if (parsed.edgeBends && typeof parsed.edgeBends === 'object') {
          edgeBends[parsed.machineKey] = {
            ...edgeBends[parsed.machineKey],
            ...parsed.edgeBends,
          };
          changed = true;
        }
      } catch {
        // Ignore corrupt layout cache file
      }
    }
  } catch {
    return doc;
  }
  return changed ? { ...doc, layouts, edgeBends } : doc;
}

function loadOrCreateActiveStateDoc(
  instanceRoot: string,
  entries: readonly SpecEntry[],
  demoMode: boolean,
): StudioStateDoc {
  const stateIo = makeNodeStudioStateIo(instanceRoot);
  const existing = listStudioStates(stateIo);
  if (existing[0]) {
    return mergeColdLayouts(instanceRoot, readStudioState(stateIo, existing[0].id));
  }
  const extracted = extractStudioMachines(entries).map((m) => m.draft);
  const drafts =
    extracted.length > 0
      ? extracted
      : demoMode
        ? [...buildDemoStudioWebDrafts(), ...buildDemoStudioDrafts()]
        : [];
  const baseHashes: Record<string, string> = {};
  for (const e of entries) {
    baseHashes[e.fileName] = sha256Hex(readSpecSource(instanceRoot, e.fileName));
  }
  const now = new Date().toISOString();
  const doc = createStudioStateDoc({
    id: 'workspace-draft',
    title: `${basename(instanceRoot)} Studio Draft`,
    createdAt: now,
    drafts,
  });
  return mergeColdLayouts(instanceRoot, { ...doc, revision: 0, baseHashes });
}

function buildSpecDetail(
  instanceRoot: string,
  entry: SpecEntry,
  machineKeys: string[],
): SpecDetailResponse {
  const rawText = readSpecSource(instanceRoot, entry.fileName);
  const decisionTables = extractDecisionTables(entry.doc);
  const kind: SpecDetailResponse['kind'] =
    machineKeys.length > 0 ? 'machine' : decisionTables.length > 0 ? 'decision' : 'doc';
  const foldLevels = foldFeatureAst(entry.doc, rawText);
  const rules = entry.doc.rules.map((r) => ({
    reqId: r.reqId || null,
    title: r.title,
    description: r.description,
    hardness: (ruleHasRunnableScenario(r) ? 'tested' : 'doc') as 'tested' | 'doc',
    scenarioCount: r.scenarios.length,
    scenarios: r.scenarios.map((sc) => ({
      name: sc.name,
      steps: sc.steps.map((st) => `${st.kind}: ${st.text}`),
    })),
  }));
  return {
    id: specIdOf(entry),
    file: entry.fileName,
    purpose: entry.doc.header.purpose ?? '',
    kind,
    baseHash: sha256Hex(rawText),
    rawText,
    foldLevels,
    rules,
    decisionTables,
    machineKeys,
    convertibleHint: detectConvertibleStructure(
      entry.doc,
      machineKeys.length > 0,
      decisionTables.length > 0,
    ),
  };
}

interface CachedTextfoldEntry {
  provider: 'local-ast' | 'external-serve';
  levels: [string, string, string, string, string];
}

function readTextfoldCache(instanceRoot: string): Record<string, CachedTextfoldEntry> {
  const p = join(instanceRoot, '.llman-sdd', 'studio', 'textfold-cache.json');
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    const out: Record<string, CachedTextfoldEntry> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v) && v.length === 5 && v.every((x) => typeof x === 'string')) {
        out[k] = { provider: 'local-ast', levels: v as [string, string, string, string, string] };
      } else if (typeof v === 'object' && v !== null) {
        const obj = v as { provider?: unknown; levels?: unknown };
        if (
          (obj.provider === 'local-ast' || obj.provider === 'external-serve') &&
          Array.isArray(obj.levels) &&
          obj.levels.length === 5 &&
          obj.levels.every((x) => typeof x === 'string')
        ) {
          out[k] = {
            provider: obj.provider,
            levels: obj.levels as [string, string, string, string, string],
          };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeTextfoldCache(
  instanceRoot: string,
  cache: Record<string, CachedTextfoldEntry>,
): void {
  const dir = join(instanceRoot, '.llman-sdd', 'studio');
  mkdirSync(dir, { recursive: true });
  const target = join(dir, 'textfold-cache.json');
  atomicWriteSeq += 1;
  const tmp = join(dir, `.textfold-cache.tmp.${String(process.pid)}.${String(atomicWriteSeq)}`);
  writeFileSync(tmp, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  renameSync(tmp, target);
}

async function findAvailablePort(host: string, preferredPort: number): Promise<number> {
  if (preferredPort === 0) return 0;
  for (let offset = 0; offset < 25; offset += 1) {
    const candidate = preferredPort + offset;
    const ok = await new Promise<boolean>((resolvePromise) => {
      const probe = createNetServer();
      probe.once('error', () => resolvePromise(false));
      probe.listen(candidate, host, () => {
        probe.close(() => resolvePromise(true));
      });
    });
    if (ok) return candidate;
  }
  return 0;
}

export interface CreatedStudioHubApp {
  app: Hono;
  host: string;
  token: string;
  activeWsKey: string;
  registerWorkspace: (directory: string) => WorkspaceItem;
  broadcastEvent: (event: StudioSseEvent) => void;
  setBoundPort: (port: number) => void;
  cleanup: () => void;
}

export function createStudioHubApp(options: StudioHubOptions): CreatedStudioHubApp {
  const host = options.host ?? '127.0.0.1';
  if (!isLoopbackHost(host)) {
    throw new Error(`studio server only binds to loopback addresses (got: ${host})`);
  }
  const version = options.version ?? '0.11.0';
  const token = generateStudioToken();
  const demoDefault = options.demo === true;
  let boundPort = options.port ?? 4710;

  const workspaces = new Map<string, WorkspaceRecord>();
  const registerWorkspace = (dir: string): WorkspaceItem => {
    const absDir = resolve(dir);
    const io = makeIo(absDir);
    const discoveredRoots = discoverRoots(absDir, io);
    const roots = discoveredRoots.length > 0 ? discoveredRoots.map((r) => r.rootDir) : [absDir];
    let firstItem: WorkspaceItem | null = null;
    for (const rootDir of roots) {
      const rec = discoverWorkspaceRecord(rootDir, demoDefault);
      workspaces.set(rec.item.wsKey, rec);
      if (!firstItem) firstItem = rec.item;
    }
    return firstItem ?? discoverWorkspaceRecord(absDir, demoDefault).item;
  };

  const primaryWs = registerWorkspace(options.initialDirectory);
  let activeWsKey = primaryWs.wsKey;

  const subscribers = new Set<(event: StudioSseEvent) => void>();
  const sseClosers = new Set<() => void>();
  const broadcastEvent = (event: StudioSseEvent): void => {
    for (const fn of subscribers) {
      try {
        fn(event);
      } catch {
        // Ignore disconnected stream listeners
      }
    }
  };

  // Watch specs/, changes/, resolved .git dir, and external .llman-sdd/studio/states/ writes (with self-echo guard).
  const watchers: FSWatcher[] = [];
  const watchedWsKeys = new Set<string>();
  const watchTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let lastSelfStateWriteAt = 0;
  const attachWatchers = (ws: WorkspaceItem): void => {
    if (watchedWsKeys.has(ws.wsKey)) return;
    watchedWsKeys.add(ws.wsKey);
    const gitDir = resolveGitDir(ws.worktreePath);
    const watchTargets: Array<{ dir: string; kind: 'specs' | 'git' | 'states' }> = [
      { dir: join(ws.instanceRoot, 'llmanspec', 'specs'), kind: 'specs' },
      { dir: join(ws.instanceRoot, 'llmanspec', 'changes'), kind: 'specs' },
      { dir: join(ws.instanceRoot, '.llman-sdd', 'studio', 'states'), kind: 'states' },
      ...(gitDir ? [{ dir: gitDir, kind: 'git' as const }] : []),
    ];
    for (const { dir: target, kind } of watchTargets) {
      if (!existsSync(target)) continue;
      const timerKey = `${ws.wsKey}:${kind}:${target}`;
      try {
        const w = watch(target, { persistent: false }, (_evType, fileName) => {
          if (kind === 'git' && (!fileName || !String(fileName).includes('HEAD'))) return;
          if (kind === 'states') {
            if (Date.now() - lastSelfStateWriteAt < 600) return;
            if (
              fileName &&
              (!String(fileName).endsWith('.json') || String(fileName).startsWith('.'))
            )
              return;
          }
          const prev = watchTimers.get(timerKey);
          if (prev) clearTimeout(prev);
          watchTimers.set(
            timerKey,
            setTimeout(() => {
              watchTimers.delete(timerKey);
              if (kind === 'git') {
                const refreshed = discoverWorkspaceRecord(ws.instanceRoot, demoDefault);
                workspaces.set(ws.wsKey, {
                  ...refreshed,
                  item: { ...refreshed.item, wsKey: ws.wsKey },
                });
                broadcastEvent({
                  type: 'git-head-changed',
                  wsKey: ws.wsKey,
                  branch: refreshed.item.branch,
                  protected: refreshed.item.protected,
                });
              } else if (kind === 'states') {
                const stateId = fileName
                  ? String(fileName).replace(/\.json$/u, '')
                  : 'workspace-draft';
                broadcastEvent({
                  type: 'state-updated',
                  wsKey: ws.wsKey,
                  stateId,
                  revision: 0,
                  originClientId: null,
                });
              } else {
                broadcastEvent({
                  type: 'specs-changed',
                  wsKey: ws.wsKey,
                  changedFiles: fileName ? [String(fileName)] : [],
                });
              }
            }, 150),
          );
        });
        watchers.push(w);
      } catch {
        // Ignore OS watch limits on ephemeral directories
      }
    }
  };
  attachWatchers(primaryWs);

  const resolveWs = (wsKeyParam?: string): WorkspaceRecord | null => {
    if (!wsKeyParam || wsKeyParam === 'default') {
      return workspaces.get(activeWsKey) ?? workspaces.values().next().value ?? null;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(wsKeyParam);
    } catch {
      return null;
    }
    const direct = workspaces.get(decoded);
    if (direct) return direct;
    // Forgiving fallback for URLs where trailing punctuation or @root suffix was trimmed
    const normalized = decoded.endsWith('@.')
      ? `${decoded.slice(0, -1)}root`
      : decoded.endsWith('@')
        ? `${decoded}root`
        : decoded;
    return workspaces.get(normalized) ?? null;
  };

  const app = new Hono();
  app.use('*', createLoopbackSecurityMiddleware(token));

  // --- Health & Workspace Registry ---
  app.get('/api/health', (c) => {
    const payload: HealthResponse = {
      ok: true,
      service: 'llman-sdd-studio',
      version,
      pid: process.pid,
      workspaceCount: workspaces.size,
    };
    return c.json(payload);
  });

  app.get('/api/workspaces', (c) => {
    return c.json({
      activeWsKey,
      workspaces: [...workspaces.values()].map((w) => w.item),
    });
  });

  app.post('/api/workspaces', async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const parsed = registerWorkspaceRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid request body', issues: parsed.error.issues }, 400);
    }
    if (!existsSync(parsed.data.directory)) {
      return c.json({ error: `directory does not exist: ${parsed.data.directory}` }, 400);
    }
    const item = registerWorkspace(parsed.data.directory);
    activeWsKey = item.wsKey;
    attachWatchers(item);
    return c.json({ activeWsKey, workspace: item }, 201);
  });

  // --- Helper for Workspace-scoped API handlers ---
  const handleBootstrap = (wsKeyParam?: string): BootstrapResponse | null => {
    const rec = resolveWs(wsKeyParam);
    if (!rec) return null;
    const io = makeIo(rec.item.instanceRoot);
    const entries = discoverSpecs('llmanspec/specs', io);
    const stateDoc = loadOrCreateActiveStateDoc(rec.item.instanceRoot, entries, rec.demoMode);
    const { specs, edges, staleFiles } = buildSpecIndex(rec.item.instanceRoot, entries, stateDoc);
    let mermaid = 'flowchart TD\n';
    try {
      mermaid = graphMermaid(io, rec.item.instanceRoot).join('\n');
    } catch {
      // Fallback empty flowchart when changes/ does not exist
    }
    const peerWorktrees = discoverPeerWorktrees(rec.item);
    for (const peer of peerWorktrees) {
      if (!workspaces.has(peer.wsKey)) {
        workspaces.set(peer.wsKey, { item: peer, demoMode: rec.demoMode });
      }
    }
    return {
      workspace: { ...rec.item, specCount: specs.length },
      demoMode: rec.demoMode,
      token,
      activeStateId: stateDoc.id,
      stateDoc,
      specs,
      edges,
      staleFiles,
      peerWorktrees,
      graphMermaid: mermaid,
    };
  };

  app.get('/api/bootstrap', (c) => {
    const data = handleBootstrap(c.req.query('wsKey'));
    if (!data) return c.json({ error: 'workspace not found' }, 404);
    return c.json(data);
  });

  app.get('/api/p/:wsKey/bootstrap', (c) => {
    const data = handleBootstrap(c.req.param('wsKey'));
    if (!data) return c.json({ error: 'workspace not found' }, 404);
    return c.json(data);
  });

  // --- Lazy Spec Detail Loader ---
  const handleSpecDetail = (capId: string, wsKeyParam?: string): SpecDetailResponse | null => {
    const rec = resolveWs(wsKeyParam);
    if (!rec) return null;
    const entries = discoverSpecs('llmanspec/specs', makeIo(rec.item.instanceRoot));
    const entry = entries.find((e) => specIdOf(e) === capId);
    if (!entry) return null;
    const extracted = extractStudioMachines([entry]).map((m) => m.machine.machineKey);
    return buildSpecDetail(rec.item.instanceRoot, entry, extracted);
  };

  app.get('/api/specs/:capId', (c) => {
    const detail = handleSpecDetail(c.req.param('capId'), c.req.query('wsKey'));
    if (!detail) return c.json({ error: 'spec not found' }, 404);
    return c.json(detail);
  });

  app.get('/api/p/:wsKey/specs/:capId', (c) => {
    const detail = handleSpecDetail(c.req.param('capId'), c.req.param('wsKey'));
    if (!detail) return c.json({ error: 'spec not found' }, 404);
    return c.json(detail);
  });

  // --- State Draft Read / Optimistic-Locked Write ---
  const handleGetState = (stateId: string, wsKeyParam?: string) => {
    const rec = resolveWs(wsKeyParam);
    if (!rec) return { status: 404 as const, body: { error: 'workspace not found' } };
    try {
      const id = validateStateId(stateId);
      const stateIo = makeNodeStudioStateIo(rec.item.instanceRoot);
      const doc = readStudioState(stateIo, id);
      return { status: 200 as const, body: doc };
    } catch (error) {
      return {
        status: 404 as const,
        body: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  };

  app.get('/api/states/:id', (c) => {
    const res = handleGetState(c.req.param('id'), c.req.query('wsKey'));
    return c.json(res.body, res.status);
  });

  app.get('/api/p/:wsKey/states/:id', (c) => {
    const res = handleGetState(c.req.param('id'), c.req.param('wsKey'));
    return c.json(res.body, res.status);
  });

  const handlePutState = async (
    stateId: string,
    wsKeyParam: string | undefined,
    rawBody: unknown,
    ifMatchHeader: string | undefined,
    clientIdHeader: string | undefined,
  ) => {
    const rec = resolveWs(wsKeyParam);
    if (!rec) return { status: 404 as const, body: { error: 'workspace not found' } };

    const parsed = putStateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return {
        status: 400 as const,
        body: { error: 'invalid StudioStateDoc payload', issues: parsed.error.issues },
      };
    }
    let id: string;
    try {
      id = validateStateId(stateId);
    } catch (error) {
      return {
        status: 400 as const,
        body: { error: error instanceof Error ? error.message : 'invalid state id' },
      };
    }
    if (parsed.data.doc.id !== id) {
      return {
        status: 400 as const,
        body: { error: `state id mismatch: url=${id} body=${parsed.data.doc.id}` },
      };
    }

    const stateIo = makeNodeStudioStateIo(rec.item.instanceRoot);
    let currentRevision = 0;
    let existingDoc: StudioStateDoc | null = null;
    try {
      existingDoc = readStudioState(stateIo, id);
      currentRevision = existingDoc.revision ?? 0;
    } catch {
      existingDoc = null;
    }

    let headerRev: number | undefined;
    if (ifMatchHeader !== undefined) {
      const cleaned = ifMatchHeader.replaceAll('"', '').trim();
      if (!/^\d+$/u.test(cleaned)) {
        return {
          status: 400 as const,
          body: { error: `malformed If-Match revision header: ${ifMatchHeader}` },
        };
      }
      headerRev = Number(cleaned);
    }
    const expectedRev = parsed.data.expectedRevision ?? headerRev;

    if (existingDoc !== null && expectedRev !== undefined && expectedRev !== currentRevision) {
      return {
        status: 409 as const,
        body: {
          error: 'revision conflict: state document was updated by another tab or Agent',
          currentRevision,
          latestDoc: existingDoc,
        },
      };
    }

    const nextRevision = currentRevision + 1;
    const now = new Date().toISOString();
    const nextDoc: StudioStateDoc = {
      ...parsed.data.doc,
      revision: nextRevision,
      updatedAt: now,
    };
    lastSelfStateWriteAt = Date.now();
    writeStudioState(stateIo, nextDoc);
    broadcastEvent({
      type: 'state-updated',
      wsKey: rec.item.wsKey,
      stateId: id,
      revision: nextRevision,
      originClientId: clientIdHeader ?? null,
    });
    return {
      status: 200 as const,
      body: { ok: true as const, revision: nextRevision, updatedAt: now },
    };
  };

  app.put('/api/states/:id', async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const res = await handlePutState(
      c.req.param('id'),
      c.req.query('wsKey'),
      raw,
      c.req.header('if-match'),
      c.req.header('x-studio-client-id'),
    );
    return c.json(res.body, res.status);
  });

  app.put('/api/p/:wsKey/states/:id', async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const res = await handlePutState(
      c.req.param('id'),
      c.req.param('wsKey'),
      raw,
      c.req.header('if-match'),
      c.req.header('x-studio-client-id'),
    );
    return c.json(res.body, res.status);
  });

  // --- Cold Layout & Manual Edge Bends Persistence ---
  app.get('/api/layouts/:machineKey', (c) => {
    const rec = resolveWs(c.req.query('wsKey'));
    if (!rec) return c.json({ error: 'workspace not found' }, 404);
    let key: string;
    try {
      key = decodeURIComponent(c.req.param('machineKey'));
    } catch {
      return c.json({ error: 'invalid machineKey encoding' }, 400);
    }
    const safeName = sha256Hex(key).slice(0, 16);
    const target = join(
      rec.item.instanceRoot,
      '.llman-sdd',
      'studio',
      'layouts',
      `${safeName}.json`,
    );
    if (!existsSync(target)) {
      return c.json({ machineKey: key, positions: {}, edgeBends: {} });
    }
    try {
      return c.json(JSON.parse(readFileSync(target, 'utf8')));
    } catch {
      return c.json({ machineKey: key, positions: {}, edgeBends: {} });
    }
  });

  app.put('/api/layouts/:machineKey', async (c) => {
    const rec = resolveWs(c.req.query('wsKey'));
    if (!rec) return c.json({ error: 'workspace not found' }, 404);
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const parsed = putLayoutRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid layout payload', issues: parsed.error.issues }, 400);
    }
    let key: string;
    try {
      key = decodeURIComponent(c.req.param('machineKey'));
    } catch {
      return c.json({ error: 'invalid machineKey encoding' }, 400);
    }
    const dir = join(rec.item.instanceRoot, '.llman-sdd', 'studio', 'layouts');
    mkdirSync(dir, { recursive: true });
    const safeName = sha256Hex(key).slice(0, 16);
    const target = join(dir, `${safeName}.json`);
    atomicWriteSeq += 1;
    const tmp = join(dir, `.${safeName}.tmp.${String(process.pid)}.${String(atomicWriteSeq)}`);
    writeFileSync(
      tmp,
      `${JSON.stringify({ machineKey: key, ...parsed.data, updatedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );
    renameSync(tmp, target);
    return c.json({ ok: true, machineKey: key });
  });

  // --- Workspace-Isolated Custom Forest Tab Views (.llman-sdd/studio/views.json, studio-web r154) ---
  const handleGetViews = (wsKeyParam?: string) => {
    const rec = resolveWs(wsKeyParam);
    if (!rec) return { status: 404 as const, body: { error: 'workspace not found' } };
    const viewsIo = makeNodeStudioStateIo(rec.item.instanceRoot);
    try {
      const viewsDoc = readStudioViews(viewsIo);
      return { status: 200 as const, body: { ok: true as const, viewsDoc } };
    } catch (error) {
      return {
        status: 400 as const,
        body: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  };

  app.get('/api/views', (c) => {
    const res = handleGetViews(c.req.query('wsKey'));
    return c.json(res.body, res.status);
  });

  app.get('/api/p/:wsKey/views', (c) => {
    const res = handleGetViews(c.req.param('wsKey'));
    return c.json(res.body, res.status);
  });

  const handlePutViews = (
    wsKeyParam: string | undefined,
    rawBody: unknown,
    clientIdHeader: string | undefined,
  ) => {
    const rec = resolveWs(wsKeyParam);
    if (!rec) return { status: 404 as const, body: { error: 'workspace not found' } };
    const parsed = putViewsRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return {
        status: 400 as const,
        body: { error: 'invalid StudioViewsDoc payload', issues: parsed.error.issues },
      };
    }
    const viewsIo = makeNodeStudioStateIo(rec.item.instanceRoot);
    const nextDoc = {
      ...parsed.data.viewsDoc,
      updatedAt: new Date().toISOString(),
    };
    writeStudioViews(viewsIo, nextDoc);
    broadcastEvent({
      type: 'views-updated',
      wsKey: rec.item.wsKey,
      originClientId: clientIdHeader ?? null,
    });
    return { status: 200 as const, body: { ok: true as const, viewsDoc: nextDoc } };
  };

  app.put('/api/views', async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const res = handlePutViews(c.req.query('wsKey'), raw, c.req.header('x-studio-client-id'));
    return c.json(res.body, res.status);
  });

  app.put('/api/p/:wsKey/views', async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const res = handlePutViews(c.req.param('wsKey'), raw, c.req.header('x-studio-client-id'));
    return c.json(res.body, res.status);
  });

  // --- Agent Revision Accept / Reject ---
  app.post('/api/states/:id/revisions/:revId/:action', (c) => {
    const rec = resolveWs(c.req.query('wsKey'));
    if (!rec) return c.json({ error: 'workspace not found' }, 404);
    const action = c.req.param('action');
    if (action !== 'accept' && action !== 'reject') {
      return c.json({ error: `unsupported revision action: ${action}` }, 400);
    }
    try {
      const stateIo = makeNodeStudioStateIo(rec.item.instanceRoot);
      const doc = readStudioState(stateIo, c.req.param('id'));
      const now = new Date().toISOString();
      const updated =
        action === 'accept'
          ? acceptRevisionProposal(doc, c.req.param('revId'), now)
          : rejectRevisionProposal(doc, c.req.param('revId'), now);
      const nextRevision = (doc.revision ?? 0) + 1;
      const nextDoc: StudioStateDoc = { ...updated, revision: nextRevision };
      lastSelfStateWriteAt = Date.now();
      writeStudioState(stateIo, nextDoc);
      broadcastEvent({
        type: 'state-updated',
        wsKey: rec.item.wsKey,
        stateId: nextDoc.id,
        revision: nextRevision,
        originClientId: c.req.header('x-studio-client-id') ?? null,
      });
      return c.json({ ok: true, doc: nextDoc });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  // --- In-Memory Unified Diff Preview ---
  app.post('/api/states/:id/preview-diff', (c) => {
    const rec = resolveWs(c.req.query('wsKey'));
    if (!rec) return c.json({ error: 'workspace not found' }, 404);
    try {
      const stateIo = makeNodeStudioStateIo(rec.item.instanceRoot);
      const doc = readStudioState(stateIo, c.req.param('id'));
      const io = makeIo(rec.item.instanceRoot);
      const diffs = Object.entries(doc.machines).map(([machineKey, draft]) => {
        const beforeText = io.exists(draft.sourceFile) ? io.readText(draft.sourceFile) : null;
        const expectedHash = doc.baseHashes?.[draft.sourceFile];
        const stale =
          expectedHash !== undefined &&
          beforeText !== null &&
          sha256Hex(beforeText) !== expectedHash;
        const afterText = renderUpdatedFeatureSource(beforeText, draft);
        const unifiedDiff = previewFeatureUnifiedDiff(draft.sourceFile, beforeText, afterText);
        const semanticDiff = formatSemanticDiff(computeMachineDiff(draft), draft);
        return { machineKey, sourceFile: draft.sourceFile, unifiedDiff, semanticDiff, stale };
      });
      return c.json({ diffs });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  // --- Export Proposal Draft (NEVER writes llmanspec/specs/) ---
  app.post('/api/states/:id/export-proposal', async (c) => {
    const rec = resolveWs(c.req.query('wsKey'));
    if (!rec) return c.json({ error: 'workspace not found' }, 404);
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const parsed = exportProposalRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid export proposal payload', issues: parsed.error.issues }, 400);
    }
    try {
      const changeId = validateStateId(parsed.data.changeId);
      const stateIo = makeNodeStudioStateIo(rec.item.instanceRoot);
      const doc = readStudioState(stateIo, c.req.param('id'));
      const proposalContent = buildProposalDraft({
        title: parsed.data.title,
        why: parsed.data.why,
        drafts: Object.values(doc.machines),
        comments: doc.comments.filter((cm) => cm.status === 'open'),
        dependsOn: parsed.data.dependsOn ?? [],
      });
      const relPath = `llmanspec/changes/${changeId}/proposal.md`;
      const absPath = join(rec.item.instanceRoot, relPath);
      mkdirSync(join(rec.item.instanceRoot, 'llmanspec', 'changes', changeId), { recursive: true });
      writeFileSync(absPath, proposalContent, 'utf8');
      return c.json({ ok: true, changeId, proposalPath: relPath }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  // --- TextFold Two-Tier Folding Proxy (Tier 0 Local AST + Optional Tier 1 External Serve) ---
  app.post('/api/textfold/fold', async (c) => {
    const rec = resolveWs(c.req.query('wsKey'));
    if (!rec) return c.json({ error: 'workspace not found' }, 404);
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const parsed = textfoldRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json({ error: 'invalid textfold payload', issues: parsed.error.issues }, 400);
    }
    const digest = sha256Hex(parsed.data.content);
    const cache = readTextfoldCache(rec.item.instanceRoot);
    const cachedEntry = cache[digest];
    if (cachedEntry) {
      const hit: TextfoldResponse = {
        provider: cachedEntry.provider,
        cached: true,
        sha256: digest,
        levels: cachedEntry.levels,
      };
      return c.json(hit);
    }

    const externalEndpoint = parsed.data.endpoint ?? process.env.LLMAN_SDD_TEXTFOLD_URL;
    if (externalEndpoint) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(externalEndpoint);
      } catch {
        return c.json({ error: 'invalid external textfold endpoint URL' }, 400);
      }
      if (!isLoopbackHost(parsedUrl.hostname)) {
        return c.json(
          {
            error: 'external textfold endpoint must target a loopback host (127.0.0.1 / localhost)',
          },
          400,
        );
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${externalEndpoint.replace(/\/+$/u, '')}/fold`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content: parsed.data.content }),
          signal: controller.signal,
        });
        if (res.ok) {
          const extJson = (await res.json()) as { levels?: unknown };
          if (
            Array.isArray(extJson.levels) &&
            extJson.levels.length === 5 &&
            extJson.levels.every((x) => typeof x === 'string')
          ) {
            const levels = extJson.levels as [string, string, string, string, string];
            cache[digest] = { provider: 'external-serve', levels };
            writeTextfoldCache(rec.item.instanceRoot, cache);
            return c.json({ provider: 'external-serve', cached: false, sha256: digest, levels });
          }
        }
      } catch {
        // Silent graceful fallback to Tier 0 deterministic local AST folding
      } finally {
        clearTimeout(timer);
      }
    }

    let levels: [string, string, string, string, string];
    try {
      const doc = parseCapability(
        parsed.data.content,
        `${parsed.data.capability ?? 'spec'}.feature`,
      );
      levels = foldFeatureAst(doc, parsed.data.content);
    } catch {
      levels = foldPlainText(parsed.data.content);
    }
    cache[digest] = { provider: 'local-ast', levels };
    writeTextfoldCache(rec.item.instanceRoot, cache);
    return c.json({ provider: 'local-ast', cached: false, sha256: digest, levels });
  });

  // --- Tier 0 Local BM25 + Optional Tier 1 Loopback RAG Semantic Search Proxy (r159) ---
  const ragCache = new Map<string, { expiresAt: number; response: StudioSearchResponse }>();

  const handleWorkspaceSearch = async (wsKeyParam: string | undefined, rawBody: unknown) => {
    const rec = resolveWs(wsKeyParam);
    if (!rec) return { status: 404 as const, body: { error: 'workspace not found' } };
    const parsed = studioSearchRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return {
        status: 400 as const,
        body: { error: 'invalid search payload', issues: parsed.error.issues },
      };
    }
    const { query, topK = 20, endpoint } = parsed.data;
    const entries = discoverSpecs('llmanspec/specs', makeIo(rec.item.instanceRoot));
    const parsedSpecs = entries.map((entry) => ({ capId: specIdOf(entry), doc: entry.doc }));
    let activeStateDoc = null;
    try {
      const stateIo = makeNodeStudioStateIo(rec.item.instanceRoot);
      const summaries = listStudioStates(stateIo);
      if (summaries.length > 0) {
        activeStateDoc = readStudioState(stateIo, summaries[0]!.id);
      }
    } catch {
      activeStateDoc = null;
    }
    const docs = buildWorkspaceSearchDocuments(parsedSpecs, activeStateDoc);

    const ragUrl = endpoint ?? process.env.LLMAN_SDD_STUDIO_RAG_URL;
    let degradedReason: string | undefined;
    if (ragUrl) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(ragUrl);
      } catch {
        return { status: 400 as const, body: { error: 'invalid external RAG endpoint URL' } };
      }
      if (!isLoopbackHost(parsedUrl.hostname)) {
        return {
          status: 400 as const,
          body: {
            error: 'external RAG endpoint must target a loopback host (127.0.0.1 / localhost)',
          },
        };
      }
      const cacheKey = `${rec.item.wsKey}|${ragUrl}|${query}|${String(topK)}`;
      const cached = ragCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { status: 200 as const, body: { ...cached.response, cached: true } };
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        const bearer = process.env.LLMAN_SDD_STUDIO_RAG_TOKEN;
        if (bearer) headers['authorization'] = `Bearer ${bearer}`;
        const res = await fetch(`${ragUrl.replace(/\/+$/u, '')}/search`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ query, workspaceKey: rec.item.wsKey, topK }),
          signal: controller.signal,
        });
        if (res.ok) {
          const ext = (await res.json()) as { hits?: unknown };
          if (Array.isArray(ext.hits)) {
            const mapped: StudioSearchHit[] = [];
            for (const [idx, rawHit] of ext.hits.entries()) {
              if (!rawHit || typeof rawHit !== 'object') continue;
              const h = rawHit as Record<string, unknown>;
              const targetKind =
                h.targetKind === 'spec' ||
                h.targetKind === 'rule' ||
                h.targetKind === 'state' ||
                h.targetKind === 'edge' ||
                h.targetKind === 'decision' ||
                h.targetKind === 'comment' ||
                h.targetKind === 'timeline'
                  ? h.targetKind
                  : 'spec';
              const targetId =
                typeof h.targetId === 'string' && h.targetId ? h.targetId : `hit-${String(idx)}`;
              const capId = typeof h.capId === 'string' && h.capId ? h.capId : targetId;
              mapped.push({
                id: `rag:${targetKind}:${targetId}:${String(idx)}`,
                targetKind,
                targetId,
                capId,
                ...(typeof h.machineKey === 'string' && h.machineKey
                  ? { machineKey: h.machineKey }
                  : {}),
                title: typeof h.title === 'string' && h.title ? h.title : `${capId} · ${targetId}`,
                snippet: typeof h.snippet === 'string' ? h.snippet : '',
                score: typeof h.score === 'number' ? h.score : 1,
                source: 'rag-serve',
              });
            }
            const response: StudioSearchResponse = {
              provider: 'rag-serve',
              cached: false,
              totalIndexed: docs.length,
              hits: mapped.slice(0, topK),
            };
            ragCache.set(cacheKey, { expiresAt: Date.now() + 30_000, response });
            return { status: 200 as const, body: response };
          }
          degradedReason = 'external RAG payload missing hits array';
        } else {
          degradedReason = `external RAG returned HTTP ${String(res.status)}`;
        }
      } catch (error) {
        degradedReason = error instanceof Error ? error.message : 'external RAG unreachable';
      } finally {
        clearTimeout(timer);
      }
    }

    const hits = searchWorkspaceBm25(docs, query, topK);
    const fallback: StudioSearchResponse = {
      provider: 'local-bm25',
      cached: false,
      ...(degradedReason ? { degradedReason } : {}),
      totalIndexed: docs.length,
      hits,
    };
    return { status: 200 as const, body: fallback };
  };

  app.post('/api/search', async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const res = await handleWorkspaceSearch(c.req.query('wsKey'), raw);
    return c.json(res.body, res.status);
  });

  app.post('/api/p/:wsKey/search', async (c) => {
    const raw = (await c.req.json().catch(() => null)) as unknown;
    const res = await handleWorkspaceSearch(c.req.param('wsKey'), raw);
    return c.json(res.body, res.status);
  });

  // --- SSE Real-Time Event Stream ---
  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      const send = (ev: StudioSseEvent): void => {
        void stream.writeSSE({ event: ev.type, data: JSON.stringify(ev) });
      };
      subscribers.add(send);
      await stream.writeSSE({
        event: 'ping',
        data: JSON.stringify({ type: 'ping', ts: new Date().toISOString() }),
      });
      await new Promise<void>((resolveDone) => {
        const heartbeat = setInterval(() => {
          void stream.writeSSE({
            event: 'ping',
            data: JSON.stringify({ type: 'ping', ts: new Date().toISOString() }),
          });
        }, 25000);
        let closed = false;
        const closeStream = (): void => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          subscribers.delete(send);
          sseClosers.delete(closeStream);
          resolveDone();
        };
        sseClosers.add(closeStream);
        stream.onAbort(closeStream);
      });
    });
  });

  // --- Canonical Deep-Link Transparent HTTP GET Content Negotiation ---
  const handleDeepLink = (c: Context, wsKeyParam: string) => {
    const boot = handleBootstrap(wsKeyParam);
    if (!boot) return c.text('workspace not found', 404);
    const format = resolveNegotiatedFormat(c.req.header('accept'), c.req.query('format'));
    const targetKind = (c.req.query('kind') ?? 'macro') as StudioFocusContext['targetKind'];
    const targetId = c.req.query('target') ?? 'default';
    const baseUrl = formatLoopbackUrl(host, boundPort);
    const focus: StudioFocusContext = {
      wsKey: boot.workspace.wsKey,
      repo: boot.workspace.repo,
      branch: boot.workspace.branch,
      targetKind: ['macro', 'machine', 'doc', 'state', 'edge'].includes(targetKind)
        ? targetKind
        : 'macro',
      targetId,
      canonicalUrl: `${baseUrl}/p/${encodeURIComponent(boot.workspace.wsKey)}?kind=${encodeURIComponent(targetKind)}&target=${encodeURIComponent(targetId)}`,
      summary: `${boot.workspace.repo} (${boot.workspace.branch}) · ${String(boot.specs.length)} specs`,
    };

    if (format === 'json') {
      return c.json({ focus, workspace: boot.workspace, specs: boot.specs, edges: boot.edges });
    }
    if (format === 'markdown') {
      const openComments = boot.stateDoc.comments.filter((cm) => cm.status === 'open').length;
      return c.text(
        renderNegotiatedMarkdown({
          workspace: boot.workspace,
          focus,
          specs: boot.specs,
          openCommentCount: openComments,
          baseUrl,
        }),
        200,
        { 'content-type': 'text/markdown; charset=utf-8' },
      );
    }
    return c.html(renderSpaHtmlWithFocus(focus, options.studioDistDir));
  };

  app.get('/p/:wsKey', (c) => handleDeepLink(c, c.req.param('wsKey')));
  app.get('/p/:wsKey/*', (c) => handleDeepLink(c, c.req.param('wsKey')));

  // --- Static Asset & SPA Root Hosting ---
  app.get('*', (c) => {
    const reqPath = c.req.path;
    if (reqPath.startsWith('/api/')) {
      return c.json({ error: `not found: ${reqPath}` }, 404);
    }
    const asset = loadStudioAsset(reqPath, options.studioDistDir);
    if (asset && reqPath !== '/' && reqPath !== '/index.html') {
      return new Response(new Uint8Array(asset.bytes), {
        status: 200,
        headers: { 'content-type': asset.contentType },
      });
    }
    const boot = handleBootstrap(activeWsKey);
    const focus: StudioFocusContext = {
      wsKey: boot?.workspace.wsKey ?? activeWsKey,
      repo: boot?.workspace.repo ?? primaryWs.repo,
      branch: boot?.workspace.branch ?? primaryWs.branch,
      targetKind: 'macro',
      targetId: 'default',
      canonicalUrl: `${formatLoopbackUrl(host, boundPort)}/`,
      summary: `${primaryWs.repo} (${primaryWs.branch})`,
    };
    return c.html(renderSpaHtmlWithFocus(focus, options.studioDistDir));
  });

  return {
    app,
    host,
    token,
    activeWsKey,
    registerWorkspace,
    broadcastEvent,
    setBoundPort: (p: number) => {
      boundPort = p;
    },
    cleanup: () => {
      for (const timer of watchTimers.values()) clearTimeout(timer);
      watchTimers.clear();
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // Ignore
        }
      }
      for (const closeStream of sseClosers) closeStream();
      sseClosers.clear();
      subscribers.clear();
    },
  };
}

export async function startStudioHub(options: StudioHubOptions): Promise<RunningStudioHub> {
  const hubFilePath = options.hubFilePath ?? defaultHubFilePath();
  const version = options.version ?? '0.11.0';
  const created = createStudioHubApp(options);
  const preferredPort = options.port ?? 4710;
  const listenPort = await findAvailablePort(created.host, preferredPort);
  let boundPort = listenPort;
  let serverRef: ServerType;
  await new Promise<void>((resolveListen, rejectListen) => {
    serverRef = serve(
      {
        fetch: created.app.fetch,
        hostname: created.host,
        port: listenPort,
      },
      (info: AddressInfo) => {
        boundPort = info.port;
        created.setBoundPort(boundPort);
        resolveListen();
      },
    );
    serverRef.once('error', rejectListen);
  });

  const url = formatLoopbackUrl(created.host, boundPort);
  if (options.writeHubFile !== false) {
    writeHubInfoFile(hubFilePath, {
      pid: process.pid,
      port: boundPort,
      host: created.host,
      token: created.token,
      version,
      startedAt: new Date().toISOString(),
    });
  }

  return {
    app: created.app,
    host: created.host,
    port: boundPort,
    url,
    token: created.token,
    activeWsKey: created.activeWsKey,
    registerWorkspace: created.registerWorkspace,
    broadcastEvent: created.broadcastEvent,
    close: async () => {
      created.cleanup();
      if (options.writeHubFile !== false) {
        removeHubInfoFile(hubFilePath);
      }
      await new Promise<void>((resolveClose) => {
        const closable = serverRef as ServerType & { closeAllConnections?: () => void };
        serverRef.close(() => resolveClose());
        closable.closeAllConnections?.();
      });
    },
  };
}
