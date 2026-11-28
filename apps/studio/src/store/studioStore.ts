/**
 * Studio Web Zustand store (hot semantic state vs cold layout state) with:
 * - 400ms debounced autosave + synchronous `flushPendingSaves()` barrier before workspace switches
 * - `pagehide` keepalive flush + localStorage crash-recovery snapshot per wsKey
 * - 409 optimistic revision reconciliation
 * - Multi-branch Worldline + 1:1 live canvas overlay compare
 * - 3-layer Box-in-Box nestStack + symmetric bidirectional navHistory
 * - 5-kind unified near-cursor CommentPopover
 * - 4-group Settings SSOT (2 skins, 3 edges, 2 UI toggles, optional TextFold service URL)
 */
import {
  addStudioComment,
  cloneMachineIR,
  computeMachineDiff,
  defaultStudioViewsDoc,
  deleteStudioComment,
  editStudioComment,
  formatSemanticDiff,
  nextPrefixedUid,
  recordWorldlineCommit,
  snapshotBeforeSync,
  redoTimeline,
  reopenStudioComment,
  resolveStudioComment,
  switchWorldlineHead,
  undoTimeline,
  validateMachineGraph,
  type BootstrapResponse,
  type EdgeBendOffset,
  type MachineDiagnostic,
  type NodePosition,
  type SemanticAnchor,
  type SpecDetailResponse,
  type SpecIndexEdge,
  type SpecIndexItem,
  type StudioMachineIR,
  type StudioSearchHit,
  type StudioStateDoc,
  type StudioTabView,
  type StudioTheoremDto,
  setStudioCommentWatchTag,
  type StudioSseEvent,
  type StudioViewsDoc,
  type SyncItem,
  type SyncPick,
  type TheoremLockStatus,
  type WorkspaceItem,
} from '@llman-sdd/core/studio';
import { create } from 'zustand';

import { studioApi, STUDIO_CLIENT_ID, StudioConflictError } from '../api/client.ts';
import { defaultHostFocusUid } from '../nest/parentContext.ts';
import { buildSubtreeDiffText, getSubtreeMachineIds } from '../nest/subtree.ts';
import type { EdgePreset } from '../routing/obstacleRouter.ts';
import {
  createMachineSimulationSession,
  type CompiledSimulationSession,
  type SimulationStepRecord,
} from '../simulate/xstateCompiler.ts';
import { foldActivityItems, type ActivityItem } from '../sync/activity.ts';
import { SYNC_COPY } from '../sync/copy.ts';

export type StudioSkin = 'linear' | 'washi';
export type CardTier = 'glyph' | 'map' | 'detail';
export type StudioViewKind = 'macro' | 'machine' | 'doc' | 'forest' | 'new-tab';
export type StudioMode = 'explore' | 'simulate';

export interface OpenTab {
  id: string;
  kind: StudioViewKind;
  title: string;
  targetId: string;
  pinned?: boolean;
}

export interface NestStep {
  machineKey: string;
  label: string;
}

export type CanvasFocus =
  | { kind: 'state'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'macro-edge'; id: string }
  | { kind: 'forest'; id: string };

export interface CommentPopoverState {
  anchor: SemanticAnchor;
  title: string;
  x: number;
  y: number;
}

export interface PromptModalState {
  title: string;
  subtitle: string;
  body: string;
  fullscreen: boolean;
}

export interface StickyNoteItem {
  id: string;
  text: string;
  x: number;
  y: number;
}

export interface ShareTargetState {
  kind: 'macro' | 'machine' | 'doc' | 'state' | 'edge';
  targetId: string;
  title: string;
}

export interface SearchProviderItem {
  id: string;
  kind: 'spec' | 'state' | 'command';
  title: string;
  subtitle: string;
  onSelect: () => void;
}

export interface SearchProvider {
  id: string;
  search: (query: string) => SearchProviderItem[];
}

export interface StudioStoreState {
  loading: boolean;
  error: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
  toastMsg: string | null;

  workspaces: WorkspaceItem[];
  activeWorkspace: WorkspaceItem | null;
  peerWorktrees: WorkspaceItem[];
  demoMode: boolean;

  stateDoc: StudioStateDoc | null;
  specs: SpecIndexItem[];
  edges: SpecIndexEdge[];
  staleFiles: string[];
  syncItems: SyncItem[];
  syncPicks: Record<string, SyncPick>;
  syncPanelOpen: boolean;
  syncFocusItemId: string | null;
  activityItems: ActivityItem[];
  activityOpen: boolean;
  activityEvents: StudioSseEvent[];
  promptIncludeIds: string[];
  theorems: StudioTheoremDto[];
  theoremLockStatus: TheoremLockStatus;
  theoremsOpen: boolean;
  specDetails: Record<string, SpecDetailResponse>;
  graphMermaid: string;

  tabs: OpenTab[];
  activeTabId: string;
  navHistory: Array<{ tabId: string; nestStack: NestStep[] }>;
  navIdx: number;
  nestStack: NestStep[];

  mode: StudioMode;
  simSession: CompiledSimulationSession | null;
  simActiveUid: string | null;
  simTrace: SimulationStepRecord[];
  simGuards: Record<string, boolean>;

  // Right-side Worldline drawer & 1:1 live canvas overlay diff
  worldlineOpen: boolean;
  worldlineComparing: boolean;
  worldlineCompareAId: string | null;

  // Single-slot HUD & transient popovers
  showTips: boolean;
  tipIdx: number;
  settingsOpen: boolean;
  linterOpen: boolean;
  revisionDrawerOpen: boolean;
  dagPanelOpen: boolean;
  dagFullscreen: boolean;
  cmdkOpen: boolean;
  panelFindOpen: boolean;
  panelFindQuery: string;
  panelFindMatchIds: string[];
  panelFindActiveId: string | null;
  shortcutsOpen: boolean;
  tourStep: number | null;
  saveModalOpen: boolean;
  sharePopoverOpen: boolean;
  shareTarget: ShareTargetState | null;
  commentPopover: CommentPopoverState | null;
  promptModal: PromptModalState | null;
  focusStateUid: string | null;
  canvasFocus: CanvasFocus | null;
  peekSubNodeIds: Set<string>;

  // Main view domain groups (strictly workspace-isolated, Axiom 5) & drafting sticky notes
  collapsedGroups: Set<string>;
  ungroupedDomains: Set<string>;
  stickyNotes: StickyNoteItem[];
  viewsDoc: StudioViewsDoc;
  dirtyViews: boolean;
  localTagsByCap: Record<string, string[]>;
  macroDraftNotes: string[];
  focusAdjacencyCapId: string | null;

  // Doc view 5-level TextFold & Per-View Viewport Memory (never surprise-resets user zoom/pan!)
  docFoldLevel: 0 | 1 | 2 | 3 | 4;
  zoomPercent: number;
  zoomTrigger: { action: 'in' | 'out' | 'fit'; seq: number } | null;
  viewports: Record<string, { x: number; y: number; zoom: number }>;

  // Settings SSOT (4 groups: 2 skins, 3 edge presets, 2 toggles, optional TextFold URL)
  skin: StudioSkin;
  edgePreset: EdgePreset;
  tier: CardTier;
  showMinimap: boolean;
  showLegend: boolean;
  legendKindFilter: Set<SpecIndexItem['kind']>;
  textfoldEndpoint: string;

  // Dirty tracking & server-synced optimistic revision lock
  dirtyState: boolean;
  stateEditSeq: number;
  syncedRevision: number;
  dirtyLayoutKeys: Set<string>;
  customSearchProviders: SearchProvider[];

  // Actions
  init: (wsKey?: string) => Promise<void>;
  refreshInPlace: (wsKey?: string) => Promise<void>;
  switchWorkspace: (wsKey: string) => Promise<void>;
  flushPendingSaves: (opts?: { keepalive?: boolean }) => Promise<boolean>;
  openSpecTab: (spec: SpecIndexItem) => Promise<void>;
  openMachineTab: (machineKey: string, title?: string) => void;
  openNewTabPage: () => void;
  createForestTab: (
    title: string,
    includedCapabilities: string[],
    tagFilter?: string | null,
  ) => string;
  updateActiveForestView: (patch: Partial<StudioTabView>) => void;
  addManualGroup: (title: string, capabilities: string[]) => void;
  addManualLink: (fromCap: string, toCap: string, label?: string) => void;
  removeManualLink: (linkId: string) => void;
  addLocalTagToCapabilities: (capIds: string[], tag: string) => void;
  recordMacroDraftNote: (note: string) => void;
  setFocusAdjacencyCapId: (capId: string | null) => void;
  getActiveForestView: () => StudioTabView;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string, force?: boolean) => void;
  togglePinTab: (tabId: string) => void;
  closeOtherUnpinnedTabs: (keepTabId: string) => void;
  restoreDefaultTabs: () => void;
  reorderTab: (srcId: string, targetId: string, insertBefore: boolean) => void;
  setViewportForView: (viewKey: string, vp: { x: number; y: number; zoom: number }) => void;
  clearViewportForView: (viewKey: string) => void;
  navBack: () => void;
  navForward: () => void;
  diveSubMachine: (machineKey: string, label: string) => void;
  jumpNestLevel: (idx: number, focusStateUid?: string | null) => void;
  setCanvasFocus: (focus: CanvasFocus | null) => void;
  toggleSubPeek: (machineKey: string, stateUid: string) => void;
  applyDeepLink: (input: {
    kind: string;
    target: string;
    nest: string[];
    focus: CanvasFocus | null;
  }) => void;

  mutateMachine: (
    machineKey: string,
    label: string,
    mutator: (draft: StudioMachineIR) => void,
    actor?: 'human' | 'agent',
  ) => void;
  updateNodePosition: (
    machineKey: string,
    nodeUid: string,
    pos: NodePosition,
    persist?: boolean,
  ) => void;
  updateEdgeBend: (machineKey: string, edgeUid: string, bend: EdgeBendOffset) => void;
  resetEdgeBend: (machineKey: string, edgeUid: string) => void;
  resetLayoutForScope: (scopeKey: string) => void;
  switchWorldlineTo: (machineKey: string, idx: number) => void;
  toggleWorldlineCompare: (entryId: string) => void;
  setWorldlineOpen: (open: boolean) => void;
  setTheoremsOpen: (open: boolean) => void;
  undoActiveMachine: () => void;
  redoActiveMachine: () => void;
  decideRevision: (revId: string, action: 'accept' | 'reject') => Promise<void>;

  // Direct manipulation graph ops (zero window.prompt)
  connectStates: (
    machineKey: string,
    fromUid: string,
    toUid: string,
    event?: string,
    guard?: string,
  ) => void;
  spawnStateAt: (
    machineKey: string,
    name: string,
    pos: NodePosition,
    opts?: {
      initial?: boolean;
      isGateway?: boolean;
      connectFromUid?: string;
      event?: string;
      guard?: string;
    },
  ) => string | null;
  insertStateOnEdge: (machineKey: string, edgeUid: string, pos: NodePosition) => void;
  reverseEdge: (machineKey: string, edgeUid: string) => void;
  setInitialState: (machineKey: string, stateUid: string) => void;
  renameState: (machineKey: string, stateUid: string, nextName: string) => void;
  editEdge: (machineKey: string, edgeUid: string, event: string, guard?: string) => void;
  deleteEdge: (machineKey: string, edgeUid: string) => void;
  deleteState: (machineKey: string, stateUid: string) => void;
  toggleGateway: (machineKey: string, stateUid: string) => void;

  // Domain groups, sticky notes, TextFold, zoom, popovers
  toggleCollapseGroup: (groupId: string) => void;
  ungroupDomain: (groupId: string) => void;
  addStickyNote: (x: number, y: number) => void;
  updateStickyNote: (id: string, text: string) => void;
  deleteStickyNote: (id: string) => void;
  setDocFoldLevel: (level: 0 | 1 | 2 | 3 | 4) => void;
  setZoomPercent: (pct: number) => void;
  triggerZoom: (action: 'in' | 'out' | 'fit') => void;
  setLinterOpen: (open: boolean) => void;
  setRevisionDrawerOpen: (open: boolean) => void;
  setFocusStateUid: (uid: string | null) => void;
  openShareModal: (target?: ShareTargetState | null) => void;

  // Simulation (XState v5)
  startSimulation: (machineKey: string) => void;
  stopSimulation: () => void;
  triggerSimEvent: (eventName: string) => void;
  toggleSimGuard: (guardName: string) => void;

  // Unified 5-kind comments CRUD
  openCommentPopover: (anchor: SemanticAnchor, title: string, x: number, y: number) => void;
  closeCommentPopover: () => void;
  addComment: (anchor: SemanticAnchor, body: string, watchTag?: string) => void;
  setCommentWatchTag: (commentId: string, watchTag: string) => void;
  togglePromptInclude: (commentId: string) => void;
  editComment: (commentId: string, body: string) => void;
  resolveComment: (commentId: string) => void;
  reopenComment: (commentId: string) => void;
  deleteComment: (commentId: string) => void;

  // Doc wording/semantic draft update (Scheme C)
  updateDocDraft: (capId: string, nextText: string, changeKind: 'wording' | 'semantic') => void;

  // Prompts & Proposals
  openPromptWorkbench: (title: string, subtitle: string, body: string) => void;
  closePromptWorkbench: () => void;
  togglePromptFullscreen: () => void;
  buildNegotiationPrompt: (machineKey?: string, commentIds?: string[]) => string;
  enterFileSync: () => Promise<void>;
  setSyncPick: (itemId: string, pick: SyncPick) => void;
  bulkSyncPick: (pick: SyncPick) => void;
  setSyncPanelOpen: (open: boolean) => void;
  setSyncFocusItemId: (id: string | null) => void;
  confirmSyncApply: () => Promise<void>;
  ingestSseActivity: (ev: StudioSseEvent) => void;
  setActivityOpen: (open: boolean) => void;

  // Settings & Chrome
  setSkin: (skin: StudioSkin) => void;
  setEdgePreset: (preset: EdgePreset) => void;
  setTier: (tier: CardTier) => void;
  setShowMinimap: (show: boolean) => void;
  setShowLegend: (show: boolean) => void;
  toggleLegendKind: (kind: SpecIndexItem['kind']) => void;
  setTextfoldEndpoint: (url: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setDagPanelOpen: (open: boolean) => void;
  setDagFullscreen: (full: boolean) => void;
  setCmdkOpen: (open: boolean) => void;
  setPanelFindOpen: (open: boolean) => void;
  setPanelFindQuery: (query: string) => void;
  setPanelFindMatches: (ids: string[], activeId: string | null) => void;
  openSearchHit: (hit: StudioSearchHit) => void;
  setShortcutsOpen: (open: boolean) => void;
  startTour: () => void;
  stepTour: (delta: number) => void;
  closeTour: () => void;
  setSaveModalOpen: (open: boolean) => void;
  setSharePopoverOpen: (open: boolean) => void;
  setShowTips: (show: boolean) => void;
  stepTip: (delta: number) => void;
  showToast: (msg: string) => void;
  getDiagnosticsForMachine: (machineKey: string) => MachineDiagnostic[];
  getActiveMachineKey: () => string | null;
}

let stateSaveTimer: ReturnType<typeof setTimeout> | null = null;
let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function recoveryStorageKey(wsKey: string, stateId: string): string {
  return `llman_sdd_studio_recovery:${wsKey}:${stateId}`;
}

function saveRecoverySnapshot(wsKey: string, doc: StudioStateDoc): void {
  try {
    localStorage.setItem(recoveryStorageKey(wsKey, doc.id), JSON.stringify(doc));
  } catch {
    // Ignore storage quota errors
  }
}

function uiSessionStorageKey(wsKey: string): string {
  return `llman_sdd_studio_ui:${wsKey}`;
}

interface PersistedUiSession {
  tabs: OpenTab[];
  activeTabId: string;
  nestStack: NestStep[];
  skin: StudioSkin;
  edgePreset: EdgePreset;
  tier: CardTier;
  showMinimap: boolean;
  showLegend: boolean;
  docFoldLevel: 0 | 1 | 2 | 3 | 4;
  collapsedGroups: string[];
  ungroupedDomains: string[];
  viewports: Record<string, { x: number; y: number; zoom: number }>;
}

function loadPersistedUiSession(wsKey: string): PersistedUiSession | null {
  try {
    const raw = localStorage.getItem(uiSessionStorageKey(wsKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedUiSession>;
    if (!parsed || !Array.isArray(parsed.tabs)) return null;
    return {
      tabs: parsed.tabs,
      activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : 'main',
      nestStack: Array.isArray(parsed.nestStack) ? parsed.nestStack : [],
      skin: parsed.skin === 'washi' ? 'washi' : 'linear',
      edgePreset:
        parsed.edgePreset === 'smoothstep' || parsed.edgePreset === 'straight'
          ? parsed.edgePreset
          : 'bezier',
      tier: parsed.tier === 'glyph' || parsed.tier === 'detail' ? parsed.tier : 'map',
      showMinimap: parsed.showMinimap !== false,
      showLegend: parsed.showLegend !== false,
      docFoldLevel:
        parsed.docFoldLevel === 1 ||
        parsed.docFoldLevel === 2 ||
        parsed.docFoldLevel === 3 ||
        parsed.docFoldLevel === 4
          ? parsed.docFoldLevel
          : 0,
      collapsedGroups: Array.isArray(parsed.collapsedGroups) ? parsed.collapsedGroups : [],
      ungroupedDomains: Array.isArray(parsed.ungroupedDomains) ? parsed.ungroupedDomains : [],
      viewports: parsed.viewports && typeof parsed.viewports === 'object' ? parsed.viewports : {},
    };
  } catch {
    return null;
  }
}

function savePersistedUiSession(state: StudioStoreState): void {
  const wsKey = state.activeWorkspace?.wsKey;
  if (!wsKey || typeof localStorage === 'undefined') return;
  const payload: PersistedUiSession = {
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    nestStack: state.nestStack,
    skin: state.skin,
    edgePreset: state.edgePreset,
    tier: state.tier,
    showMinimap: state.showMinimap,
    showLegend: state.showLegend,
    docFoldLevel: state.docFoldLevel,
    collapsedGroups: [...state.collapsedGroups],
    ungroupedDomains: [...state.ungroupedDomains],
    viewports: state.viewports,
  };
  try {
    localStorage.setItem(uiSessionStorageKey(wsKey), JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors
  }
  // Sync clean deep-link query params in browser URL without page reload
  if (typeof window !== 'undefined') {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId);
    const basePath = `/p/${encodeURIComponent(wsKey)}`;
    const nextUrl =
      !activeTab || activeTab.kind === 'macro'
        ? basePath
        : `${basePath}?kind=${encodeURIComponent(activeTab.kind)}&target=${encodeURIComponent(activeTab.targetId)}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }
}

function foldStudioActivity(
  events: readonly StudioSseEvent[],
  wsKey: string | undefined,
  doc: StudioStateDoc | null | undefined,
): ActivityItem[] {
  if (!wsKey) return [];
  return foldActivityItems({
    events,
    selfClientId: STUDIO_CLIENT_ID,
    activeWsKey: wsKey,
    comments: doc?.comments ?? [],
    revisions: doc?.revisions ?? [],
  });
}

function applyBootstrapToState(
  boot: BootstrapResponse,
  workspaces: WorkspaceItem[],
): Partial<StudioStoreState> {
  const mainTab: OpenTab = {
    id: 'main',
    kind: 'macro',
    title: '主视图',
    targetId: 'main',
    pinned: true,
  };
  const persisted = loadPersistedUiSession(boot.workspace.wsKey);
  const specIds = new Set(boot.specs.map((s) => s.id));
  const machineIds = new Set(Object.keys(boot.stateDoc.machines));

  let initialTabs: OpenTab[];
  let activeTabId: string;
  let nestStack: NestStep[] = [];

  if (persisted) {
    const validTabs = persisted.tabs.filter(
      (t) =>
        t.id === 'main' ||
        (t.kind === 'doc' && specIds.has(t.targetId)) ||
        (t.kind === 'machine' && machineIds.has(t.targetId)),
    );
    initialTabs = validTabs.some((t) => t.id === 'main') ? validTabs : [mainTab, ...validTabs];
    activeTabId = initialTabs.some((t) => t.id === persisted.activeTabId)
      ? persisted.activeTabId
      : 'main';
    nestStack = persisted.nestStack.filter((st) => machineIds.has(st.machineKey));
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.skin = persisted.skin;
    }
  } else {
    const firstMachineKey = Object.keys(boot.stateDoc.machines)[0];
    initialTabs =
      boot.specs.length === 0 && firstMachineKey
        ? [
            mainTab,
            {
              id: `machine:${firstMachineKey}`,
              kind: 'machine',
              title:
                boot.stateDoc.machines[firstMachineKey]?.current?.capability ?? firstMachineKey,
              targetId: firstMachineKey,
            },
          ]
        : [mainTab];
    activeTabId = initialTabs[initialTabs.length - 1]!.id;
  }

  return {
    loading: false,
    error: null,
    workspaces,
    activeWorkspace: boot.workspace,
    peerWorktrees: boot.peerWorktrees,
    demoMode: boot.demoMode,
    stateDoc: boot.stateDoc,
    specs: boot.specs,
    edges: boot.edges,
    staleFiles: boot.staleFiles,
    syncItems: [],
    syncPicks: {},
    syncPanelOpen: false,
    syncFocusItemId: null,
    activityEvents: [],
    activityItems: foldStudioActivity([], boot.workspace.wsKey, boot.stateDoc),
    theorems: boot.theorems ?? [],
    theoremLockStatus: boot.theoremLockStatus ?? 'none',
    specDetails: {},
    graphMermaid: boot.graphMermaid,
    tabs: initialTabs,
    activeTabId,
    navHistory: [{ tabId: activeTabId, nestStack }],
    navIdx: 0,
    nestStack,
    ...(persisted
      ? {
          skin: persisted.skin,
          edgePreset: persisted.edgePreset,
          tier: persisted.tier,
          showMinimap: persisted.showMinimap,
          showLegend: persisted.showLegend,
          docFoldLevel: persisted.docFoldLevel,
          collapsedGroups: new Set(persisted.collapsedGroups),
          ungroupedDomains: new Set(persisted.ungroupedDomains),
          viewports: persisted.viewports,
        }
      : {
          collapsedGroups: new Set(),
          ungroupedDomains: new Set(),
          viewports: {},
        }),
    worldlineComparing: false,
    worldlineCompareAId: null,
    stickyNotes: [],
    linterOpen: false,
    revisionDrawerOpen: false,
    focusStateUid: null,
    canvasFocus: null,
    peekSubNodeIds: new Set(),
    dirtyState: false,
    stateEditSeq: 0,
    syncedRevision: boot.stateDoc.revision ?? 0,
    dirtyLayoutKeys: new Set(),
    saveStatus: 'saved',
  };
}

export const useStudioStore = create<StudioStoreState>((set, get) => {
  const scheduleStateSave = (): void => {
    set((prev) => ({
      dirtyState: true,
      stateEditSeq: prev.stateEditSeq + 1,
      saveStatus: 'saving',
    }));
    const s = get();
    if (s.activeWorkspace && s.stateDoc) {
      saveRecoverySnapshot(s.activeWorkspace.wsKey, s.stateDoc);
    }
    if (stateSaveTimer) clearTimeout(stateSaveTimer);
    stateSaveTimer = setTimeout(() => {
      void get().flushPendingSaves();
    }, 400);
  };

  const scheduleLayoutSave = (machineKey: string): void => {
    const nextKeys = new Set(get().dirtyLayoutKeys);
    nextKeys.add(machineKey);
    set({ dirtyLayoutKeys: nextKeys });
    if (layoutSaveTimer) clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(() => {
      void get().flushPendingSaves();
    }, 400);
  };

  let viewsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleViewsSave = (): void => {
    set({ dirtyViews: true });
    if (viewsSaveTimer) clearTimeout(viewsSaveTimer);
    viewsSaveTimer = setTimeout(() => {
      viewsSaveTimer = null;
      void get().flushPendingSaves();
    }, 400);
  };

  return {
    loading: true,
    error: null,
    saveStatus: 'idle',
    toastMsg: null,

    workspaces: [],
    activeWorkspace: null,
    peerWorktrees: [],
    demoMode: false,

    stateDoc: null,
    specs: [],
    edges: [],
    staleFiles: [],
    syncItems: [],
    syncPicks: {},
    syncPanelOpen: false,
    syncFocusItemId: null,
    activityItems: [],
    activityOpen: false,
    activityEvents: [],
    promptIncludeIds: [],
    theorems: [],
    theoremLockStatus: 'none',
    theoremsOpen: false,
    specDetails: {},
    graphMermaid: 'flowchart TD\n',

    tabs: [{ id: 'main', kind: 'macro', title: '主视图', targetId: 'main', pinned: true }],
    activeTabId: 'main',
    navHistory: [{ tabId: 'main', nestStack: [] }],
    navIdx: 0,
    nestStack: [],

    mode: 'explore',
    simSession: null,
    simActiveUid: null,
    simTrace: [],
    simGuards: {},

    worldlineOpen: false,
    worldlineComparing: false,
    worldlineCompareAId: null,

    showTips: true,
    tipIdx: 0,
    settingsOpen: false,
    linterOpen: false,
    revisionDrawerOpen: false,
    dagPanelOpen: false,
    dagFullscreen: false,
    cmdkOpen: false,
    panelFindOpen: false,
    panelFindQuery: '',
    panelFindMatchIds: [],
    panelFindActiveId: null,
    shortcutsOpen: false,
    tourStep: null,
    saveModalOpen: false,
    sharePopoverOpen: false,
    shareTarget: null,
    commentPopover: null,
    promptModal: null,
    focusStateUid: null,
    canvasFocus: null,
    peekSubNodeIds: new Set(),

    collapsedGroups: new Set(),
    ungroupedDomains: new Set(),
    stickyNotes: [],
    viewsDoc: defaultStudioViewsDoc(),
    dirtyViews: false,
    localTagsByCap: {},
    macroDraftNotes: [],
    focusAdjacencyCapId: null,

    docFoldLevel: 0,
    zoomPercent: 100,
    zoomTrigger: null,
    viewports: {},

    skin: 'linear',
    edgePreset: 'bezier',
    tier: 'map',
    showMinimap: true,
    showLegend: true,
    legendKindFilter: new Set(['machine', 'flow', 'decision', 'doc']),
    textfoldEndpoint: '',

    dirtyState: false,
    stateEditSeq: 0,
    syncedRevision: 0,
    dirtyLayoutKeys: new Set(),
    customSearchProviders: [],

    init: async (wsKey?: string) => {
      set({ loading: true, error: null });
      try {
        const [wsRes, boot, viewsRes] = await Promise.all([
          studioApi.fetchWorkspaces(),
          studioApi.fetchBootstrap(wsKey),
          studioApi.fetchViews(wsKey).catch(() => null),
        ]);
        const nextSlice = applyBootstrapToState(boot, wsRes.workspaces);
        set({
          ...nextSlice,
          viewsDoc: viewsRes?.viewsDoc ?? defaultStudioViewsDoc(),
          dirtyViews: false,
          localTagsByCap: {},
          macroDraftNotes: [],
          focusAdjacencyCapId: null,
        });
        // If restored active tab is a doc tab, eagerly lazy-load its spec detail
        const st = get();
        const activeTab = st.tabs.find((t) => t.id === st.activeTabId);
        if (activeTab?.kind === 'doc' && !st.specDetails[activeTab.targetId]) {
          const detail = await studioApi.fetchSpecDetail(activeTab.targetId, boot.workspace.wsKey);
          set((prev) => ({ specDetails: { ...prev.specDetails, [activeTab.targetId]: detail } }));
        }
        if (boot.staleFiles.length > 0) {
          void get().enterFileSync();
        }
      } catch (error) {
        set({
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },

    refreshInPlace: async (wsKey?: string) => {
      try {
        const targetWs = wsKey ?? get().activeWorkspace?.wsKey;
        const [wsRes, boot, viewsRes] = await Promise.all([
          studioApi.fetchWorkspaces(),
          studioApi.fetchBootstrap(targetWs),
          studioApi.fetchViews(targetWs).catch(() => null),
        ]);
        const cur = get();
        const nextDoc = cur.dirtyState ? cur.stateDoc : boot.stateDoc;
        set({
          workspaces: wsRes.workspaces,
          activeWorkspace: boot.workspace,
          peerWorktrees: boot.peerWorktrees,
          specs: boot.specs,
          edges: boot.edges,
          staleFiles: boot.staleFiles,
          theorems: boot.theorems ?? [],
          theoremLockStatus: boot.theoremLockStatus ?? 'none',
          graphMermaid: boot.graphMermaid,
          activityItems: foldStudioActivity(cur.activityEvents, boot.workspace.wsKey, nextDoc),
          ...(!cur.dirtyViews && viewsRes?.viewsDoc ? { viewsDoc: viewsRes.viewsDoc } : {}),
          ...(cur.dirtyState
            ? {}
            : {
                stateDoc: boot.stateDoc,
                syncedRevision: boot.stateDoc.revision ?? 0,
              }),
        });
        if (boot.staleFiles.length > 0) {
          void get().enterFileSync();
        }
      } catch {
        // Ignore transient SSE background refresh errors
      }
    },

    flushPendingSaves: async (opts) => {
      if (stateSaveTimer) {
        clearTimeout(stateSaveTimer);
        stateSaveTimer = null;
      }
      if (layoutSaveTimer) {
        clearTimeout(layoutSaveTimer);
        layoutSaveTimer = null;
      }
      const s = get();
      const wsKey = s.activeWorkspace?.wsKey;
      if (!wsKey || !s.stateDoc) return true;

      let allOk = true;
      if (s.dirtyState) {
        const sentSeq = s.stateEditSeq;
        try {
          const res = await studioApi.putState(s.stateDoc, s.syncedRevision, wsKey, opts);
          const latest = get();
          if (latest.stateDoc) {
            const noNewEdits = latest.stateEditSeq === sentSeq;
            set({
              stateDoc: { ...latest.stateDoc, revision: res.revision, updatedAt: res.updatedAt },
              syncedRevision: res.revision,
              dirtyState: !noNewEdits,
              saveStatus: noNewEdits ? 'saved' : 'saving',
            });
          }
        } catch (error) {
          if (error instanceof StudioConflictError) {
            set({ saveStatus: 'conflict', syncedRevision: error.currentRevision });
            get().showToast('另一扇窗口刚保存了这份草稿');
          } else {
            set({ saveStatus: 'error' });
            get().showToast('自动保存失败，草稿已暂存于本地缓存');
          }
          allOk = false;
        }
      }

      if (s.dirtyLayoutKeys.size > 0 && s.stateDoc) {
        const keys = [...s.dirtyLayoutKeys];
        for (const mk of keys) {
          const positions = s.stateDoc.layouts[mk] ?? {};
          const edgeBends = s.stateDoc.edgeBends?.[mk];
          try {
            await studioApi.putLayout(mk, positions, edgeBends, wsKey, opts);
          } catch {
            allOk = false;
          }
        }
        if (allOk) set({ dirtyLayoutKeys: new Set() });
      }
      if (s.dirtyViews) {
        try {
          const vRes = await studioApi.putViews(s.viewsDoc, wsKey, opts);
          set({ viewsDoc: vRes.viewsDoc, dirtyViews: false });
        } catch {
          allOk = false;
        }
      }
      return allOk;
    },

    switchWorkspace: async (wsKey: string) => {
      // Flush-Before-Switch Barrier: NEVER drop last 400ms edits when changing workspace!
      const flushed = await get().flushPendingSaves();
      if (!flushed) {
        get().showToast('当前工作区尚有未保存改动，请先解决冲突后再切换');
        return;
      }
      get().stopSimulation();
      get().setWorldlineOpen(false);
      set({ loading: true, commentPopover: null });
      try {
        const [wsRes, boot, viewsRes] = await Promise.all([
          studioApi.fetchWorkspaces(),
          studioApi.fetchBootstrap(wsKey),
          studioApi.fetchViews(wsKey).catch(() => null),
        ]);
        set({
          ...applyBootstrapToState(boot, wsRes.workspaces),
          viewsDoc: viewsRes?.viewsDoc ?? defaultStudioViewsDoc(),
          dirtyViews: false,
          localTagsByCap: {},
          macroDraftNotes: [],
          focusAdjacencyCapId: null,
        });
        get().showToast(`已切换工作区：${boot.workspace.repo} (${boot.workspace.branch})`);
      } catch (error) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    },

    openSpecTab: async (spec) => {
      if (spec.kind === 'machine' && spec.machineKeys[0]) {
        get().openMachineTab(spec.machineKeys[0], spec.title);
        return;
      }
      const tabId = `doc:${spec.id}`;
      const s = get();
      const baseTabs =
        s.activeTabId === 'new-tab' ? s.tabs.filter((t) => t.id !== 'new-tab') : s.tabs;
      const exists = baseTabs.some((t) => t.id === tabId);
      const tabs = exists
        ? baseTabs
        : [...baseTabs, { id: tabId, kind: 'doc' as const, title: spec.title, targetId: spec.id }];
      const nextNav = s.navHistory.slice(0, s.navIdx + 1);
      nextNav.push({ tabId, nestStack: [] });
      set({
        tabs,
        activeTabId: tabId,
        nestStack: [],
        navHistory: nextNav,
        navIdx: nextNav.length - 1,
      });

      if (!s.specDetails[spec.id]) {
        try {
          const detail = await studioApi.fetchSpecDetail(spec.id, s.activeWorkspace?.wsKey);
          set({ specDetails: { ...get().specDetails, [spec.id]: detail } });
        } catch {
          get().showToast(`加载规格 ${spec.id} 详情失败`);
        }
      }
    },

    openMachineTab: (machineKey, title) => {
      const s = get();
      const tabId = `machine:${machineKey}`;
      const label = title ?? s.stateDoc?.machines[machineKey]?.current?.capability ?? machineKey;
      const baseTabs =
        s.activeTabId === 'new-tab' ? s.tabs.filter((t) => t.id !== 'new-tab') : s.tabs;
      const exists = baseTabs.some((t) => t.id === tabId);
      const tabs = exists
        ? baseTabs
        : [
            ...baseTabs,
            { id: tabId, kind: 'machine' as const, title: label, targetId: machineKey },
          ];
      const nextNav = s.navHistory.slice(0, s.navIdx + 1);
      nextNav.push({ tabId, nestStack: [] });
      set({
        tabs,
        activeTabId: tabId,
        nestStack: [],
        navHistory: nextNav,
        navIdx: nextNav.length - 1,
      });
    },

    openNewTabPage: () => {
      const s = get();
      const tabId = 'new-tab';
      const exists = s.tabs.some((t) => t.id === tabId);
      const tabs = exists
        ? s.tabs
        : [
            ...s.tabs,
            { id: tabId, kind: 'new-tab' as const, title: '新标签页', targetId: 'new-tab' },
          ];
      const nextNav = s.navHistory.slice(0, s.navIdx + 1);
      nextNav.push({ tabId, nestStack: [] });
      set({
        tabs,
        activeTabId: tabId,
        nestStack: [],
        navHistory: nextNav,
        navIdx: nextNav.length - 1,
      });
    },

    createForestTab: (title, includedCapabilities, tagFilter = null) => {
      const s = get();
      const viewId = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const cleanTitle = title.trim() || '自定义视图';
      const newView: StudioTabView = {
        id: viewId,
        title: cleanTitle,
        pinned: false,
        includedCapabilities: [...new Set(includedCapabilities)],
        tagFilter,
        showExternalHops: false,
        bridgeOnly: false,
        manualLinks: [],
        manualGroups: [],
        macroPositions: {},
      };
      const nextViewsDoc: StudioViewsDoc = {
        ...s.viewsDoc,
        updatedAt: new Date().toISOString(),
        views: [...s.viewsDoc.views, newView],
      };
      const tabId = `forest:${viewId}`;
      const nextTabs = [
        ...s.tabs.filter((t) => t.id !== 'new-tab'),
        { id: tabId, kind: 'forest' as const, title: cleanTitle, targetId: viewId },
      ];
      const nextNav = s.navHistory.slice(0, s.navIdx + 1);
      nextNav.push({ tabId, nestStack: [] });
      set({
        viewsDoc: nextViewsDoc,
        tabs: nextTabs,
        activeTabId: tabId,
        nestStack: [],
        navHistory: nextNav,
        navIdx: nextNav.length - 1,
      });
      scheduleViewsSave();
      get().showToast(`已新建视图 Tab「${cleanTitle}」`);
      return viewId;
    },

    getActiveForestView: () => {
      const s = get();
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const targetViewId = tab?.kind === 'forest' ? tab.targetId : 'main';
      return (
        s.viewsDoc.views.find((v) => v.id === targetViewId) ??
        s.viewsDoc.views[0] ??
        defaultStudioViewsDoc().views[0]!
      );
    },

    updateActiveForestView: (patch) => {
      const s = get();
      const activeView = s.getActiveForestView();
      const exists = s.viewsDoc.views.some((v) => v.id === activeView.id);
      const nextViews = exists
        ? s.viewsDoc.views.map((v) => (v.id === activeView.id ? { ...v, ...patch } : v))
        : [...s.viewsDoc.views, { ...activeView, ...patch }];
      set({
        viewsDoc: {
          ...s.viewsDoc,
          updatedAt: new Date().toISOString(),
          views: nextViews,
        },
      });
      scheduleViewsSave();
    },

    addManualGroup: (title, capabilities) => {
      const s = get();
      const unique = [...new Set(capabilities)];
      if (unique.length === 0) return;
      const activeView = s.getActiveForestView();
      const gid = `mg-${Date.now().toString(36)}`;
      const tones = ['blue', 'teal', 'violet', 'amber'];
      const tone = tones[activeView.manualGroups.length % tones.length]!;
      s.updateActiveForestView({
        manualGroups: [
          ...activeView.manualGroups,
          { id: gid, title: title.trim() || '自定义分组', tone, capabilities: unique },
        ],
      });
      get().showToast(
        `已打包领域分组「${title.trim() || '自定义分组'}」(${String(unique.length)} 项)`,
      );
    },

    addManualLink: (fromCap, toCap, label = '人工参考') => {
      if (fromCap === toCap) return;
      const s = get();
      const activeView = s.getActiveForestView();
      if (activeView.manualLinks.some((l) => l.fromCap === fromCap && l.toCap === toCap)) return;
      const id = `ml-${Date.now().toString(36)}`;
      s.updateActiveForestView({
        manualLinks: [...activeView.manualLinks, { id, fromCap, toCap, label }],
      });
      get().showToast('已添加本地参考虚线（仅存 views.json，不修改 specs）');
    },

    removeManualLink: (linkId) => {
      const s = get();
      const activeView = s.getActiveForestView();
      s.updateActiveForestView({
        manualLinks: activeView.manualLinks.filter((l) => l.id !== linkId),
      });
    },

    addLocalTagToCapabilities: (capIds, rawTag) => {
      const cleaned = rawTag.trim().replace(/^#+/u, '');
      if (!cleaned || capIds.length === 0) return;
      const tag = `#${cleaned}`;
      set((s) => {
        const next = { ...s.localTagsByCap };
        for (const id of capIds) {
          const cur = next[id] ?? [];
          if (!cur.includes(tag)) next[id] = [...cur, tag];
        }
        return { localTagsByCap: next };
      });
      get().showToast(`已为 ${String(capIds.length)} 个规格打上本地标签 ${tag}`);
    },

    recordMacroDraftNote: (note) => {
      const trimmed = note.trim();
      if (!trimmed) return;
      set((s) => ({ macroDraftNotes: [...s.macroDraftNotes, trimmed] }));
      get().showToast('已记录至协商草稿（遵守红线：不直改 llmanspec/specs/*.feature）');
    },

    setFocusAdjacencyCapId: (capId) => set({ focusAdjacencyCapId: capId }),

    activateTab: (tabId) => {
      const s = get();
      if (s.activeTabId === tabId) return;
      get().stopSimulation();
      const nextNav = s.navHistory.slice(0, s.navIdx + 1);
      nextNav.push({ tabId, nestStack: [] });
      set({ activeTabId: tabId, nestStack: [], navHistory: nextNav, navIdx: nextNav.length - 1 });
      const targetTab = s.tabs.find((t) => t.id === tabId);
      if (targetTab?.kind === 'doc' && !s.specDetails[targetTab.targetId] && s.activeWorkspace) {
        const wsKey = s.activeWorkspace.wsKey;
        const capId = targetTab.targetId;
        void studioApi
          .fetchSpecDetail(capId, wsKey)
          .then((detail) => {
            set((prev) => ({ specDetails: { ...prev.specDetails, [capId]: detail } }));
          })
          .catch(() => {
            get().showToast(`加载规格 ${capId} 详情失败`);
          });
      }
    },

    closeTab: (tabId, force = false) => {
      const s = get();
      const target = s.tabs.find((t) => t.id === tabId);
      if (!target) return;
      if (target.pinned && !force) return;
      const nextTabs = s.tabs.filter((t) => t.id !== tabId);
      if (nextTabs.length === 0) {
        const quickTab: OpenTab = {
          id: 'new-tab',
          kind: 'new-tab',
          title: '新标签页',
          targetId: 'new-tab',
        };
        set({ tabs: [quickTab], activeTabId: 'new-tab', nestStack: [] });
        return;
      }
      const nextActive =
        s.activeTabId === tabId
          ? (nextTabs[nextTabs.length - 1]?.id ?? nextTabs[0]!.id)
          : s.activeTabId;
      set({ tabs: nextTabs, activeTabId: nextActive, nestStack: [] });
    },

    togglePinTab: (tabId) => {
      const s = get();
      const target = s.tabs.find((t) => t.id === tabId);
      if (!target) return;
      const nextPinned = !target.pinned;
      const updated = s.tabs.map((t) => (t.id === tabId ? { ...t, pinned: nextPinned } : t));
      const pinned = updated.filter((t) => t.pinned);
      const unpinned = updated.filter((t) => !t.pinned);
      set({ tabs: [...pinned, ...unpinned] });
      get().showToast(nextPinned ? `已置顶「${target.title}」` : `已取消置顶「${target.title}」`);
    },

    closeOtherUnpinnedTabs: (keepTabId) => {
      const s = get();
      const nextTabs = s.tabs.filter((t) => t.id === keepTabId || t.pinned);
      set({
        tabs: nextTabs,
        activeTabId: nextTabs.some((t) => t.id === keepTabId)
          ? keepTabId
          : (nextTabs[0]?.id ?? 'main'),
        nestStack: [],
      });
      get().showToast('已关闭其他未置顶标签页');
    },

    restoreDefaultTabs: () => {
      const mainTab: OpenTab = {
        id: 'main',
        kind: 'macro',
        title: '主视图',
        targetId: 'main',
        pinned: true,
      };
      set({
        tabs: [mainTab],
        activeTabId: 'main',
        nestStack: [],
        navHistory: [{ tabId: 'main', nestStack: [] }],
        navIdx: 0,
      });
      get().showToast('已恢复默认工作区 Tab');
    },

    reorderTab: (srcId, targetId, insertBefore) => {
      const s = get();
      if (srcId === targetId) return;
      const fromIdx = s.tabs.findIndex((t) => t.id === srcId);
      const toIdx = s.tabs.findIndex((t) => t.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      if (Boolean(s.tabs[fromIdx]?.pinned) !== Boolean(s.tabs[toIdx]?.pinned)) return;
      const next = [...s.tabs];
      const [moved] = next.splice(fromIdx, 1);
      if (!moved) return;
      let insertAt = next.findIndex((t) => t.id === targetId);
      if (!insertBefore) insertAt += 1;
      next.splice(insertAt, 0, moved);
      set({ tabs: next });
    },

    setViewportForView: (viewKey, vp) => {
      set((s) => ({ viewports: { ...s.viewports, [viewKey]: vp } }));
    },

    clearViewportForView: (viewKey) => {
      set((s) => {
        const next = { ...s.viewports };
        delete next[viewKey];
        return { viewports: next };
      });
    },

    navBack: () => {
      const s = get();
      if (s.navIdx <= 0) return;
      const prev = s.navHistory[s.navIdx - 1];
      if (!prev) return;
      set({ activeTabId: prev.tabId, nestStack: prev.nestStack, navIdx: s.navIdx - 1 });
    },

    navForward: () => {
      const s = get();
      if (s.navIdx >= s.navHistory.length - 1) return;
      const next = s.navHistory[s.navIdx + 1];
      if (!next) return;
      set({ activeTabId: next.tabId, nestStack: next.nestStack, navIdx: s.navIdx + 1 });
    },

    diveSubMachine: (machineKey, label) => {
      const s = get();
      const nextStack = [...s.nestStack, { machineKey, label }];
      const nextNav = s.navHistory.slice(0, s.navIdx + 1);
      nextNav.push({ tabId: s.activeTabId, nestStack: nextStack });
      set({ nestStack: nextStack, navHistory: nextNav, navIdx: nextNav.length - 1 });
    },

    jumpNestLevel: (idx, focusStateUid) => {
      const s = get();
      const nextStack = idx < 0 ? [] : s.nestStack.slice(0, idx + 1);
      const nextNav = s.navHistory.slice(0, s.navIdx + 1);
      nextNav.push({ tabId: s.activeTabId, nestStack: nextStack });
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      const tabRoot = tab?.kind === 'machine' ? tab.targetId : '';
      const resolve = (key: string) =>
        s.stateDoc?.machines[key]?.current ?? s.stateDoc?.machines[key]?.baseline ?? null;
      const hostUid =
        focusStateUid !== undefined
          ? focusStateUid
          : defaultHostFocusUid(s.nestStack, idx, tabRoot, resolve);
      set({
        nestStack: nextStack,
        navHistory: nextNav,
        navIdx: nextNav.length - 1,
        focusStateUid: hostUid,
        canvasFocus: hostUid ? { kind: 'state', id: hostUid } : null,
      });
    },

    setCanvasFocus: (focus) =>
      set({
        canvasFocus: focus,
        focusStateUid: focus?.kind === 'state' ? focus.id : null,
      }),

    toggleSubPeek: (machineKey, stateUid) => {
      const key = `${machineKey}:${stateUid}`;
      const next = new Set(get().peekSubNodeIds);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      set({ peekSubNodeIds: next });
    },

    applyDeepLink: (input) => {
      const s = get();
      const doc = s.stateDoc;
      if (!doc) return;
      if (input.kind === 'machine' && doc.machines[input.target]) {
        s.openMachineTab(input.target);
      } else if (input.kind === 'doc') {
        const spec = s.specs.find((item) => item.id === input.target);
        if (spec) void s.openSpecTab(spec);
      } else if (input.kind === 'macro' || input.kind === 'forest') {
        const liveTabs = get();
        if (liveTabs.activeTabId !== 'main') {
          set({ activeTabId: 'main' });
        }
      }
      const live = get();
      let nextStack: NestStep[] = live.nestStack;
      if (input.nest.length > 1) {
        const nested = input.nest.slice(1).filter((key) => doc.machines[key]);
        nextStack = nested.map((machineKey) => ({
          machineKey,
          label: doc.machines[machineKey]?.current?.ruleTitle ?? machineKey,
        }));
      } else if (input.nest.length === 0) {
        nextStack = [];
      }
      const focus = input.focus;
      set({
        nestStack: nextStack,
        canvasFocus: focus,
        focusStateUid: focus?.kind === 'state' ? focus.id : null,
      });
    },

    mutateMachine: (machineKey, label, mutator, actor = 'human') => {
      const s = get();
      const doc = s.stateDoc;
      const draft = doc?.machines[machineKey];
      if (!doc || !draft?.current) return;
      const nextIr = cloneMachineIR(draft.current);
      mutator(nextIr);
      const nextDoc = recordWorldlineCommit(doc, machineKey, nextIr, {
        label,
        createdAt: new Date().toISOString(),
        actor,
        branchRef: s.activeWorkspace?.branch,
      });
      set({ stateDoc: nextDoc });
      scheduleStateSave();
    },

    updateNodePosition: (machineKey, nodeUid, pos, persist = true) => {
      const doc = get().stateDoc;
      if (!doc) return;
      const curMap = doc.layouts[machineKey] ?? {};
      const nextDoc: StudioStateDoc = {
        ...doc,
        layouts: { ...doc.layouts, [machineKey]: { ...curMap, [nodeUid]: pos } },
      };
      set({ stateDoc: nextDoc });
      if (persist) scheduleLayoutSave(machineKey);
    },

    updateEdgeBend: (machineKey, edgeUid, bend) => {
      const doc = get().stateDoc;
      if (!doc) return;
      const curMap = doc.edgeBends?.[machineKey] ?? {};
      const nextDoc: StudioStateDoc = {
        ...doc,
        edgeBends: { ...doc.edgeBends, [machineKey]: { ...curMap, [edgeUid]: bend } },
      };
      set({ stateDoc: nextDoc });
      scheduleLayoutSave(machineKey);
    },

    resetEdgeBend: (machineKey, edgeUid) => {
      const doc = get().stateDoc;
      if (!doc?.edgeBends?.[machineKey]) return;
      const curMap = { ...doc.edgeBends[machineKey] };
      delete curMap[edgeUid];
      set({ stateDoc: { ...doc, edgeBends: { ...doc.edgeBends, [machineKey]: curMap } } });
      scheduleLayoutSave(machineKey);
    },

    resetLayoutForScope: (scopeKey) => {
      const doc = get().stateDoc;
      if (!doc) return;
      const nextLayouts = { ...doc.layouts };
      nextLayouts[scopeKey] = {};
      const nextBends = { ...doc.edgeBends };
      nextBends[scopeKey] = {};
      set({ stateDoc: { ...doc, layouts: nextLayouts, edgeBends: nextBends } });
      scheduleLayoutSave(scopeKey);
      get().showToast('已按默认拓扑自动整理画布布局');
    },

    switchWorldlineTo: (machineKey, idx) => {
      const doc = get().stateDoc;
      if (!doc) return;
      const nextDoc = switchWorldlineHead(doc, machineKey, idx, new Date().toISOString());
      set({ stateDoc: nextDoc });
      scheduleStateSave();
    },

    undoActiveMachine: () => {
      const mk = get().getActiveMachineKey();
      const doc = get().stateDoc;
      if (!mk || !doc) return;
      const tl = doc.timelines[mk];
      if (!tl || tl.headIdx <= 0) return;
      const nextDoc = undoTimeline(doc, mk, new Date().toISOString());
      set({ stateDoc: nextDoc });
      scheduleStateSave();
      get().showToast('已撤销上一步变更');
    },

    redoActiveMachine: () => {
      const mk = get().getActiveMachineKey();
      const doc = get().stateDoc;
      if (!mk || !doc) return;
      const tl = doc.timelines[mk];
      if (!tl || tl.headIdx >= tl.entries.length - 1) return;
      const nextDoc = redoTimeline(doc, mk, new Date().toISOString());
      set({ stateDoc: nextDoc });
      scheduleStateSave();
      get().showToast('已重做变更');
    },

    decideRevision: async (revId, action) => {
      const s = get();
      if (!s.stateDoc || !s.activeWorkspace) return;
      await s.flushPendingSaves();
      try {
        const updated = await studioApi.decideRevision(
          s.stateDoc.id,
          revId,
          action,
          s.activeWorkspace.wsKey,
        );
        set({
          stateDoc: updated,
          syncedRevision: updated.revision ?? s.syncedRevision + 1,
          dirtyState: false,
          saveStatus: 'saved',
        });
        get().showToast(action === 'accept' ? `已采纳 Agent 建议 ${revId}` : `已忽略建议 ${revId}`);
      } catch (error) {
        get().showToast(error instanceof Error ? error.message : '处理建议失败');
      }
    },

    connectStates: (machineKey, fromUid, toUid, event = '流转', guard) => {
      get().mutateMachine(machineKey, `连线 ${event}`, (ir) => {
        const uid = nextEdgeUid(ir);
        ir.transitions.push({
          uid,
          fromUid,
          toUid,
          event: event.trim() || '流转',
          ...(guard?.trim() ? { guard: guard.trim() } : {}),
        });
      });
    },

    spawnStateAt: (machineKey, name, pos, opts) => {
      const doc = get().stateDoc;
      const machine = doc?.machines[machineKey]?.current;
      if (!doc || !machine) return null;
      const newUid = nextStateUid(machine);
      get().mutateMachine(machineKey, `新增节点「${name}」`, (ir) => {
        ir.states.push({
          uid: newUid,
          name: name.trim() || '新状态',
          ...(opts?.isGateway ? { isGateway: true } : {}),
        });
        if (opts?.initial) {
          ir.initialStateUid = newUid;
        }
        if (opts?.connectFromUid) {
          ir.transitions.push({
            uid: nextEdgeUid(ir),
            fromUid: opts.connectFromUid,
            toUid: newUid,
            event: opts.event?.trim() || '流转',
            ...(opts.guard?.trim() ? { guard: opts.guard.trim() } : {}),
          });
        }
      });
      get().updateNodePosition(machineKey, newUid, pos, true);
      return newUid;
    },

    insertStateOnEdge: (machineKey, edgeUid, pos) => {
      const doc = get().stateDoc;
      const machine = doc?.machines[machineKey]?.current;
      if (!doc || !machine) return;
      const newUid = nextStateUid(machine);
      get().mutateMachine(machineKey, '在连线中插入中间节点', (ir) => {
        const idx = ir.transitions.findIndex((t) => t.uid === edgeUid);
        if (idx < 0) return;
        const orig = ir.transitions[idx]!;
        ir.states.push({ uid: newUid, name: ir.graphKind === 'flow' ? '中间步骤' : '中间状态' });
        ir.transitions.splice(
          idx,
          1,
          {
            uid: nextEdgeUid(ir),
            fromUid: orig.fromUid,
            toUid: newUid,
            event: orig.event,
            ...(orig.guard ? { guard: orig.guard } : {}),
          },
          {
            uid: `e${String(Number(nextEdgeUid(ir).slice(1)) + 1)}`,
            fromUid: newUid,
            toUid: orig.toUid,
            event: '继续',
          },
        );
      });
      get().updateNodePosition(machineKey, newUid, pos, true);
    },

    reverseEdge: (machineKey, edgeUid) => {
      get().mutateMachine(machineKey, '反转连线方向', (ir) => {
        const edge = ir.transitions.find((t) => t.uid === edgeUid);
        if (!edge) return;
        const tmp = edge.fromUid;
        edge.fromUid = edge.toUid;
        edge.toUid = tmp;
      });
    },

    setInitialState: (machineKey, stateUid) => {
      get().mutateMachine(machineKey, '设置初始状态', (ir) => {
        ir.initialStateUid = stateUid;
      });
    },

    renameState: (machineKey, stateUid, nextName) => {
      const trimmed = nextName.trim();
      if (!trimmed) return;
      get().mutateMachine(machineKey, `改名「${trimmed}」`, (ir) => {
        const st = ir.states.find((x) => x.uid === stateUid);
        if (st) st.name = trimmed;
      });
    },

    editEdge: (machineKey, edgeUid, event, guard) => {
      const trimmedEvent = event.trim() || '流转';
      const trimmedGuard = guard?.trim() ?? '';
      get().mutateMachine(machineKey, `修改转移「${trimmedEvent}」`, (ir) => {
        const edge = ir.transitions.find((t) => t.uid === edgeUid);
        if (!edge) return;
        edge.event = trimmedEvent;
        if (trimmedGuard) edge.guard = trimmedGuard;
        else delete edge.guard;
      });
    },

    deleteEdge: (machineKey, edgeUid) => {
      get().mutateMachine(machineKey, '删除转移边', (ir) => {
        ir.transitions = ir.transitions.filter((t) => t.uid !== edgeUid);
      });
    },

    deleteState: (machineKey, stateUid) => {
      get().mutateMachine(machineKey, '删除状态节点', (ir) => {
        ir.states = ir.states.filter((x) => x.uid !== stateUid);
        ir.transitions = ir.transitions.filter(
          (t) => t.fromUid !== stateUid && t.toUid !== stateUid,
        );
      });
    },

    toggleGateway: (machineKey, stateUid) => {
      get().mutateMachine(machineKey, '切换条件判断节点形态', (ir) => {
        const st = ir.states.find((x) => x.uid === stateUid);
        if (st) st.isGateway = !st.isGateway;
      });
    },

    toggleCollapseGroup: (groupId) => {
      const next = new Set(get().collapsedGroups);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      set({ collapsedGroups: next });
    },

    ungroupDomain: (groupId) => {
      const next = new Set(get().ungroupedDomains);
      next.add(groupId);
      set({ ungroupedDomains: next });
      get().showToast('已解散该领域视觉分组（不影响规格文件）');
    },

    addStickyNote: (x, y) => {
      const id = `note-${String(Date.now())}`;
      set((s) => ({
        stickyNotes: [...s.stickyNotes, { id, text: '记录设计要点或待办...', x, y }],
      }));
    },

    updateStickyNote: (id, text) => {
      set((s) => ({
        stickyNotes: s.stickyNotes.map((n) => (n.id === id ? { ...n, text } : n)),
      }));
    },

    deleteStickyNote: (id) => {
      set((s) => ({ stickyNotes: s.stickyNotes.filter((n) => n.id !== id) }));
    },

    setDocFoldLevel: (docFoldLevel) => set({ docFoldLevel }),
    setZoomPercent: (zoomPercent) => set({ zoomPercent }),
    triggerZoom: (action) =>
      set((s) => ({ zoomTrigger: { action, seq: (s.zoomTrigger?.seq ?? 0) + 1 } })),
    setLinterOpen: (linterOpen) => set({ linterOpen }),
    setRevisionDrawerOpen: (revisionDrawerOpen) => set({ revisionDrawerOpen }),
    setFocusStateUid: (focusStateUid) => set({ focusStateUid }),
    openShareModal: (target = null) => set({ shareTarget: target, sharePopoverOpen: true }),

    toggleWorldlineCompare: (entryId) => {
      const s = get();
      if (s.worldlineComparing && s.worldlineCompareAId === entryId) {
        set({ worldlineComparing: false, worldlineCompareAId: null });
      } else {
        set({ worldlineComparing: true, worldlineCompareAId: entryId });
      }
    },

    setWorldlineOpen: (open) => {
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('wl-open', open);
      }
      set({
        worldlineOpen: open,
        ...(open
          ? { theoremsOpen: false }
          : { worldlineComparing: false, worldlineCompareAId: null }),
      });
    },
    setTheoremsOpen: (open) => {
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('wl-open', open);
      }
      set({
        theoremsOpen: open,
        ...(open
          ? { worldlineOpen: false, worldlineComparing: false, worldlineCompareAId: null }
          : {}),
      });
    },

    startSimulation: (machineKey) => {
      const machine = get().stateDoc?.machines[machineKey]?.current;
      if (!machine) return;
      get().simSession?.stop();
      const session = createMachineSimulationSession(machine);
      set({
        mode: 'simulate',
        simSession: session,
        simActiveUid: session.currentStateUid(),
        simTrace: [],
        simGuards: session.getGuards(),
      });
    },

    stopSimulation: () => {
      get().simSession?.stop();
      set({ mode: 'explore', simSession: null, simActiveUid: null, simTrace: [] });
    },

    triggerSimEvent: (eventName) => {
      const sess = get().simSession;
      if (!sess) return;
      const res = sess.send(eventName);
      if (!res.transitioned) {
        get().showToast(`事件「${eventName}」未满足守卫条件，请先开启底部守卫开关`);
        return;
      }
      set({ simActiveUid: sess.currentStateUid(), simTrace: sess.getTrace() });
    },

    toggleSimGuard: (guardName) => {
      const sess = get().simSession;
      if (!sess) return;
      const cur = sess.getGuards();
      sess.setGuard(guardName, !cur[guardName]);
      set({ simGuards: sess.getGuards() });
    },

    openCommentPopover: (anchor, title, x, y) => {
      set({ commentPopover: { anchor, title, x, y } });
    },

    closeCommentPopover: () => set({ commentPopover: null }),

    addComment: (anchor, body, watchTag) => {
      const doc = get().stateDoc;
      if (!doc || body.trim() === '') return;
      const next = addStudioComment(doc, {
        anchor,
        author: 'human',
        body,
        createdAt: new Date().toISOString(),
        ...(watchTag !== undefined && watchTag.trim() !== '' ? { watchTag: watchTag.trim() } : {}),
      });
      set({ stateDoc: next });
      scheduleStateSave();
    },

    setCommentWatchTag: (commentId, watchTag) => {
      const doc = get().stateDoc;
      if (!doc) return;
      set({
        stateDoc: setStudioCommentWatchTag(doc, commentId, watchTag, new Date().toISOString()),
      });
      scheduleStateSave();
    },

    togglePromptInclude: (commentId) => {
      const cur = get().promptIncludeIds;
      set({
        promptIncludeIds: cur.includes(commentId)
          ? cur.filter((id) => id !== commentId)
          : [...cur, commentId],
      });
    },

    editComment: (commentId, body) => {
      const doc = get().stateDoc;
      if (!doc || body.trim() === '') return;
      const next = editStudioComment(doc, commentId, {
        body,
        updatedAt: new Date().toISOString(),
      });
      set({ stateDoc: next });
      scheduleStateSave();
    },

    resolveComment: (commentId) => {
      const doc = get().stateDoc;
      if (!doc) return;
      set({ stateDoc: resolveStudioComment(doc, commentId, new Date().toISOString()) });
      scheduleStateSave();
    },

    reopenComment: (commentId) => {
      const doc = get().stateDoc;
      if (!doc) return;
      set({ stateDoc: reopenStudioComment(doc, commentId, new Date().toISOString()) });
      scheduleStateSave();
    },

    deleteComment: (commentId) => {
      const doc = get().stateDoc;
      if (!doc) return;
      set({ stateDoc: deleteStudioComment(doc, commentId, new Date().toISOString()) });
      scheduleStateSave();
    },

    updateDocDraft: (capId, nextText, changeKind) => {
      const s = get();
      const doc = s.stateDoc;
      const detail = s.specDetails[capId];
      if (!doc || !detail) return;
      const nextDoc: StudioStateDoc = {
        ...doc,
        docDrafts: {
          ...doc.docDrafts,
          [capId]: {
            sourceFile: detail.file,
            baseHash: detail.baseHash,
            currentText: nextText,
            changeKind,
          },
        },
      };
      set({ stateDoc: nextDoc });
      scheduleStateSave();
    },

    openPromptWorkbench: (title, subtitle, body) => {
      set({ promptModal: { title, subtitle, body, fullscreen: false } });
    },

    closePromptWorkbench: () => set({ promptModal: null }),

    togglePromptFullscreen: () => {
      const pm = get().promptModal;
      if (!pm) return;
      set({ promptModal: { ...pm, fullscreen: !pm.fullscreen } });
    },

    buildNegotiationPrompt: (machineKey, commentIds) => {
      const s = get();
      const doc = s.stateDoc;
      const ws = s.activeWorkspace;
      if (!doc || !ws) return '';
      const resolve = (key: string) =>
        doc.machines[key]?.current ?? doc.machines[key]?.baseline ?? null;
      const targetKeys = machineKey
        ? getSubtreeMachineIds(machineKey, resolve)
        : Object.keys(doc.machines);
      const subtreeText = machineKey ? buildSubtreeDiffText(machineKey, doc.machines) : '';
      const diffBlocks: string[] = [];
      if (subtreeText !== '') {
        diffBlocks.push(`\`\`\`diff\n${subtreeText}\n\`\`\``);
      }
      for (const mk of targetKeys) {
        if (machineKey && subtreeText !== '') break;
        const draft = doc.machines[mk];
        if (!draft) continue;
        const diff = computeMachineDiff(draft);
        if (!diff.hasChanges) continue;
        const diags = draft.current ? validateMachineGraph(draft.current) : [];
        const lintNote =
          diags.length > 0
            ? `\n门禁提醒：${diags.map((d) => `[${d.code}] ${d.message}`).join('；')}`
            : '\n门禁状态：E1–E4 / W1–W2 全绿';
        diffBlocks.push(
          `### ${mk} (${draft.sourceFile})\n\`\`\`diff\n${formatSemanticDiff(diff, draft)}\n\`\`\`${lintNote}`,
        );
      }
      const macroDraftLines = s.macroDraftNotes.map((n) => `- [全景结构草稿意图] ${n}`);
      const selected = commentIds ?? get().promptIncludeIds;
      const subtreeIds = new Set(targetKeys);
      const openComments = doc.comments.filter((c) => {
        if (c.status !== 'open') return false;
        if (selected.length === 0) {
          if (!machineKey) return true;
          if (
            c.anchor.kind === 'state' ||
            c.anchor.kind === 'edge' ||
            c.anchor.kind === 'machine'
          ) {
            return subtreeIds.has(c.anchor.machineKey);
          }
          return true;
        }
        return selected.includes(c.id);
      });
      const commentLines = openComments.map((c) => {
        const loc =
          c.anchor.kind === 'state'
            ? `${c.anchor.machineKey} · 节点(${c.anchor.stateUid})`
            : c.anchor.kind === 'edge'
              ? `${c.anchor.machineKey} · 连线(${c.anchor.edgeUid})`
              : c.anchor.kind === 'machine'
                ? c.anchor.machineKey
                : c.anchor.kind === 'forest'
                  ? `主视图 · ${c.anchor.capability}`
                  : c.anchor.kind === 'macro-edge'
                    ? `主视图连线(${c.anchor.edgeId})`
                    : `${c.anchor.capability}${c.anchor.reqId ? ` · ${c.anchor.reqId}` : ''}`;
        return `- [定位: ${loc}] ${c.body}`;
      });
      return [
        `# Studio 规格调整请求 · ${ws.repo} (${ws.branch})`,
        '',
        `- 草稿 ID: \`${doc.id}\``,
        `- 工作区: \`${ws.wsKey}\``,
        '',
        '## 1. 语义变更摘要',
        diffBlocks.length > 0
          ? diffBlocks.join('\n\n')
          : '- 暂无状态机净差异，请结合下方全景结构草稿与锚定评论处理。',
        ...(macroDraftLines.length > 0
          ? ['', '## 1.5 全景结构草稿意图（经提案/特性分支落盘）', ...macroDraftLines]
          : []),
        '',
        '## 2. 未解决评论',
        commentLines.length > 0 ? commentLines.join('\n') : '- 无',
        '',
        '## 3. 执行与回执指令',
        `1. 先运行 \`llman-sdd studio diff ${doc.id}\` 与 \`llman-sdd studio validate ${doc.id}\` 核验变更；`,
        `2. 若需反提案，请调用 \`llman-sdd studio revise ${doc.id}\` 回推建议层（不要直接覆盖人类草稿）；`,
        `3. 同步更新规格、实现与测试并确保门禁全绿。`,
      ].join('\n');
    },

    enterFileSync: async () => {
      const s = get();
      if (!s.stateDoc || !s.activeWorkspace || s.staleFiles.length === 0) {
        set({ syncItems: [], syncPicks: {}, syncPanelOpen: false });
        return;
      }
      let next = s.stateDoc;
      const now = new Date().toISOString();
      for (const [mk, draft] of Object.entries(next.machines)) {
        if (s.staleFiles.includes(draft.sourceFile)) {
          next = snapshotBeforeSync(next, mk, now);
        }
      }
      if (next !== s.stateDoc) {
        set({ stateDoc: next, dirtyState: true });
        await get().flushPendingSaves();
      }
      try {
        const preview = await studioApi.syncPreview(next.id, s.activeWorkspace.wsKey);
        const picks: Record<string, SyncPick> = {};
        for (const item of preview.items) {
          if (item.defaultPick) picks[item.id] = item.defaultPick;
        }
        set({
          syncItems: preview.items,
          syncPicks: picks,
          staleFiles: preview.staleFiles,
          syncPanelOpen: preview.items.length > 0,
        });
      } catch {
        set({ toastMsg: SYNC_COPY.banner });
      }
    },

    setSyncPick: (itemId, pick) => {
      set({ syncPicks: { ...get().syncPicks, [itemId]: pick } });
    },

    bulkSyncPick: (pick) => {
      const picks: Record<string, SyncPick> = { ...get().syncPicks };
      for (const item of get().syncItems) {
        picks[item.id] = pick;
      }
      set({ syncPicks: picks });
    },

    setSyncPanelOpen: (syncPanelOpen) => set({ syncPanelOpen }),
    setSyncFocusItemId: (syncFocusItemId) => set({ syncFocusItemId }),

    confirmSyncApply: async () => {
      const s = get();
      if (!s.stateDoc || !s.activeWorkspace) return;
      try {
        const res = await studioApi.syncApply(s.stateDoc.id, s.syncPicks, s.activeWorkspace.wsKey);
        const blocked = res.blocked[0];
        if (blocked) {
          get().showToast(SYNC_COPY.sameThing);
          return;
        }
        set({
          stateDoc: res.doc,
          syncedRevision: res.doc.revision ?? s.syncedRevision,
          dirtyState: false,
          syncItems: [],
          syncPicks: {},
          syncPanelOpen: false,
          syncFocusItemId: null,
          staleFiles: [],
        });
      } catch (error) {
        get().showToast(error instanceof Error ? error.message : '同步失败');
      }
    },

    ingestSseActivity: (ev) => {
      const s = get();
      if (!s.activeWorkspace) return;
      const events = [...s.activityEvents, ev].slice(-40);
      set({
        activityEvents: events,
        activityItems: foldStudioActivity(events, s.activeWorkspace.wsKey, s.stateDoc),
      });
    },

    setActivityOpen: (activityOpen) => set({ activityOpen }),

    setSkin: (skin) => {
      if (typeof document !== 'undefined') document.documentElement.dataset.skin = skin;
      set({ skin });
    },

    setEdgePreset: (edgePreset) => set({ edgePreset }),
    setTier: (tier) => set({ tier }),
    setShowMinimap: (showMinimap) => set({ showMinimap }),
    setShowLegend: (showLegend) => set({ showLegend }),
    toggleLegendKind: (kind) => {
      const next = new Set(get().legendKindFilter);
      if (next.has(kind) && next.size > 1) next.delete(kind);
      else next.add(kind);
      set({ legendKindFilter: next });
    },
    setTextfoldEndpoint: (textfoldEndpoint) => set({ textfoldEndpoint }),
    setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
    setDagPanelOpen: (dagPanelOpen) => set({ dagPanelOpen }),
    setDagFullscreen: (dagFullscreen) => set({ dagFullscreen }),
    setCmdkOpen: (cmdkOpen) => set({ cmdkOpen }),
    setPanelFindOpen: (panelFindOpen) =>
      set((s) => ({
        panelFindOpen,
        ...(panelFindOpen ? {} : { panelFindMatchIds: [], panelFindActiveId: null }),
        panelFindQuery: panelFindOpen ? s.panelFindQuery : '',
      })),
    setPanelFindQuery: (panelFindQuery) => set({ panelFindQuery }),
    setPanelFindMatches: (panelFindMatchIds, panelFindActiveId) =>
      set({ panelFindMatchIds, panelFindActiveId }),
    openSearchHit: (hit) => {
      const s = get();
      if (hit.targetKind === 'theorem') {
        s.setTheoremsOpen(true);
        return;
      }
      if (hit.machineKey) {
        s.openMachineTab(hit.machineKey, hit.capId);
        if (hit.targetKind === 'state' || hit.targetKind === 'edge') {
          s.setFocusStateUid(hit.targetId);
        }
        return;
      }
      const sp = s.specs.find((item) => item.id === hit.capId);
      if (sp) {
        void s.openSpecTab(sp);
      }
    },
    setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    startTour: () => set({ tourStep: 0, settingsOpen: false }),
    stepTour: (delta) =>
      set((s) => {
        if (s.tourStep === null) return s;
        const next = Math.max(0, Math.min(5, s.tourStep + delta));
        return { tourStep: next };
      }),
    closeTour: () => set({ tourStep: null }),
    setSaveModalOpen: (saveModalOpen) => set({ saveModalOpen }),
    setSharePopoverOpen: (sharePopoverOpen) => set({ sharePopoverOpen }),
    setShowTips: (showTips) => set({ showTips }),
    stepTip: (delta) => set((s) => ({ tipIdx: (s.tipIdx + delta + 4) % 4 })),

    showToast: (msg) => {
      set({ toastMsg: msg });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toastMsg: null }), 2600);
    },

    getDiagnosticsForMachine: (machineKey) => {
      const machine = get().stateDoc?.machines[machineKey]?.current;
      return machine ? validateMachineGraph(machine) : [];
    },

    getActiveMachineKey: () => {
      const s = get();
      if (s.nestStack.length > 0) return s.nestStack[s.nestStack.length - 1]!.machineKey;
      const tab = s.tabs.find((t) => t.id === s.activeTabId);
      return tab?.kind === 'machine' ? tab.targetId : null;
    },
  };
});

// Persist per-workspace UI navigation & view state so browser refresh restores exact open tabs & view
useStudioStore.subscribe((state, prev) => {
  if (state.loading || !state.activeWorkspace) return;
  if (
    state.tabs !== prev.tabs ||
    state.activeTabId !== prev.activeTabId ||
    state.nestStack !== prev.nestStack ||
    state.skin !== prev.skin ||
    state.edgePreset !== prev.edgePreset ||
    state.tier !== prev.tier ||
    state.showMinimap !== prev.showMinimap ||
    state.showLegend !== prev.showLegend ||
    state.docFoldLevel !== prev.docFoldLevel ||
    state.collapsedGroups !== prev.collapsedGroups ||
    state.ungroupedDomains !== prev.ungroupedDomains ||
    state.viewports !== prev.viewports
  ) {
    savePersistedUiSession(state);
  }
});

export function nextStateUid(machine: StudioMachineIR): string {
  return nextPrefixedUid(
    's',
    machine.states.map((s) => s.uid),
  );
}

export function nextEdgeUid(machine: StudioMachineIR): string {
  return nextPrefixedUid(
    'e',
    machine.transitions.map((t) => t.uid),
  );
}
