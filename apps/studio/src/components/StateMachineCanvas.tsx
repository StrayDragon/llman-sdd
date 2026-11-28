/**
 * Unified @xyflow/react Canvas (Demo P0+P1 Craft Parity):
 * - Main View: Exclusive Domain Group containers (Axiom 5, collapse/expand/ungroup), 3-tier Spec Cards
 *   with 4 semantic type color wells, color-coded hardness pills, hover-only 进入 Tab, sticky notes
 * - Machine / Flow View: Box-in-Box Boundary Frame + Upstream/Downstream Portal Ghost Pills,
 *   distinct Init/Normal/Terminal/Gateway nodes, onConnect port wiring, onConnectEnd drag-empty
 *   dialect radial spawn, double-click/Enter floating inline editors (zero window.prompt),
 *   Tab quick-create downstream, Delete delete, 1:1 live Worldline red/green diff overlay
 * - Concentric Radial Pie Menu across all 6 right-click contexts
 * - Obstacle-aware corridor edge routing, self-loop arc, parallel edge spread, draggable edge bends
 */
import {
  computeCrossForestBridges,
  computeWorldlineOverlayDiff,
  type EdgeBendOffset,
  type ForestEdgeEvidence,
  type SemanticAnchor,
  type SpecIndexItem,
  type StudioMachineIR,
} from '@llman-sdd/core/studio';
import {
  Background,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CircleDot,
  Diamond,
  ExternalLink,
  FileText,
  Flag,
  Folder,
  GitBranch,
  GitMerge,
  Layers,
  Maximize2,
  MessageSquare,
  Minimize2,
  Network,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Share2,
  StickyNote,
  Table2,
  Target,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

import {
  computeDriftCalibrationOverlay,
  getPendingDriftProposals,
} from '../drift/reconcileOverlay.ts';
import { STUDIO_CONTRAST_PALETTES } from '../ergonomics/contrast.ts';
import {
  alignSelectedNodes,
  distributeSelectedNodes,
  nudgeCoord,
  tidySelectedGrid,
  type AlignMode,
  type DistributeAxis,
  type NodeBoxInput,
} from '../ergonomics/layoutTidy.ts';
import {
  buildExclusiveDomainGroupsWithManual,
  computeFocusAdjacencySet,
  computeOneHopExternalCaps,
  extractPortalEvidence,
  layoutMainViewWithGroups,
  type GroupTone,
} from '../routing/domainGroups.ts';
import {
  resolveLabelPosition,
  routeObstacleAwareEdge,
  type EdgePreset,
  type RectBox,
  type Segment2D,
} from '../routing/obstacleRouter.ts';
import { useStudioStore, type CardTier } from '../store/studioStore.ts';
import { computeSyncCanvasOverlay } from '../sync/overlay.ts';
import { RadialMenu, type RadialMenuItem } from './RadialMenu.tsx';

// --- Node & Edge Data Types ---

interface DomainGroupNodeData extends Record<string, unknown> {
  groupId: string;
  title: string;
  tone: GroupTone;
  memberIds: string[];
  width: number;
  height: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onUngroup: () => void;
  onOpenFirst: () => void;
}

interface SpecNodeData extends Record<string, unknown> {
  spec: SpecIndexItem;
  tier: CardTier;
  commentCount: number;
  dimmed?: boolean;
  externalHop?: boolean;
  onOpen: () => void;
  onComment: (x: number, y: number) => void;
}

interface StickyNoteNodeData extends Record<string, unknown> {
  id: string;
  text: string;
  onChange: (text: string) => void;
  onDelete: () => void;
}

interface MachineBoundaryNodeData extends Record<string, unknown> {
  title: string;
  file: string;
  width: number;
  height: number;
  nested: boolean;
}

interface PortalPillNodeData extends Record<string, unknown> {
  direction: 'upstream' | 'downstream';
  capId: string;
  label: string;
  onPreview: (x: number, y: number) => void;
}

interface StateNodeData extends Record<string, unknown> {
  uid: string;
  label: string;
  tier: CardTier;
  initial: boolean;
  terminal: boolean;
  isGateway: boolean;
  subMachineKey?: string;
  diffBadge?: 'added' | 'changed' | 'removed';
  simActive: boolean;
  hasError: boolean;
  commentCount: number;
  focused: boolean;
  syncPulse?: 'ours' | 'theirs' | 'focus';
  onDive?: () => void;
  onInlineEdit: (x: number, y: number) => void;
}

interface ObstacleEdgeData extends Record<string, unknown> {
  label: string;
  dPath: string;
  lx: number;
  ly: number;
  stroke: string;
  dashed?: boolean;
  machineKey?: string;
  edgeUid?: string;
  bendOffset?: EdgeBendOffset;
  simClickable?: boolean;
  syncPulse?: 'ours' | 'theirs' | 'focus';
  onSimClick?: () => void;
  onBendDrag?: (next: EdgeBendOffset) => void;
  onDoubleClick?: (x: number, y: number) => void;
}

const KIND_LABELS: Record<SpecIndexItem['kind'], string> = {
  machine: '状态机',
  flow: '流程图',
  decision: '决策表',
  doc: '规则',
};

const HARDNESS_LABELS: Record<SpecIndexItem['hardness'], string> = {
  formal: '形式化',
  'drift-guarded': '防漂移',
  tested: '已绑测试',
  doc: '仅文档',
};

// --- Custom React Flow Node Components ---

function DomainGroupNode({ data }: NodeProps<Node<DomainGroupNodeData>>) {
  if (data.collapsed) {
    return (
      <div
        className="studio-float rounded-xl p-3.5 w-[276px] border-[1.5px]"
        style={{
          borderColor:
            data.tone === 'teal'
              ? 'var(--t-machine)'
              : data.tone === 'blue'
                ? 'var(--t-decision)'
                : data.tone === 'violet'
                  ? 'var(--t-flow)'
                  : 'var(--t-doc)',
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-xs">
            <Folder size={13} />
            <span>{data.title}</span>
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {data.memberIds.length}
            </span>
          </div>
          <button
            type="button"
            onClick={data.onToggleCollapse}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10.5px] cursor-pointer hover:bg-black/5"
            style={{ borderColor: 'var(--border)' }}
          >
            <Maximize2 size={10} />
            <span>展开</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-1 mt-2.5">
          {data.memberIds.map((id) => (
            <span
              key={id}
              className="font-mono text-[10px] px-1.5 py-0.5 rounded border"
              style={{
                background: 'var(--surface-subtle)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {id}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      data-group-members={data.memberIds.join(',')}
      className={`group-frame tone-${data.tone} relative pointer-events-none`}
      style={{ width: data.width, height: data.height }}
    >
      <div
        className="absolute left-3 -top-[15px] pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-xs select-none"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <Folder size={12} style={{ color: 'var(--text-secondary)' }} />
        <span className="font-bold text-[11.5px]">{data.title}</span>
        <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {data.memberIds.length}
        </span>
        <div className="inline-flex items-center gap-0.5 ml-1">
          <button
            type="button"
            title="打开域内主规格"
            onClick={data.onOpenFirst}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] hover:bg-black/5 cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ExternalLink size={10} />
            <span>Tab</span>
          </button>
          <button
            type="button"
            title="折叠为聚合卡"
            onClick={data.onToggleCollapse}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            <Minimize2 size={10} />
          </button>
          <button
            type="button"
            title="解散视觉分组"
            onClick={data.onUngroup}
            className="p-1 rounded hover:bg-red-50 hover:text-red-600 cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecCardNode({ data, selected }: NodeProps<Node<SpecNodeData>>) {
  const { spec, tier, commentCount, onOpen, onComment } = data;
  const Icon =
    spec.kind === 'machine'
      ? Workflow
      : spec.kind === 'flow'
        ? GitMerge
        : spec.kind === 'decision'
          ? Table2
          : FileText;

  if (tier === 'glyph') {
    return (
      <div
        onDoubleClick={onOpen}
        className="flex flex-col items-center gap-2 cursor-pointer select-none"
      >
        <Handle type="target" position={Position.Left} className="studio-port" />
        <Handle type="source" position={Position.Right} className="studio-port" />
        <div
          className={`type-icon-box ${spec.kind} w-[86px] h-[86px] rounded-[22px]`}
          style={{
            borderWidth: 2,
            boxShadow: selected
              ? '0 0 0 3px var(--surface), 0 0 0 5px var(--ink)'
              : 'var(--shadow-card)',
          }}
        >
          <Icon size={34} />
        </div>
        <div
          className="px-2.5 py-0.5 rounded-lg border text-[12.5px] font-bold whitespace-nowrap"
          style={{
            background: 'var(--surface)',
            borderColor: selected ? 'var(--ink)' : 'var(--border)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {spec.title}
        </div>
      </div>
    );
  }

  const isDetail = tier === 'detail';
  return (
    <div
      onDoubleClick={onOpen}
      className={`studio-card studio-spec-card relative cursor-grab active:cursor-grabbing ${selected ? 'is-selected' : ''}`}
      style={{
        width: isDetail ? 304 : 254,
        padding: isDetail ? '13px 14px' : '12px 13px',
        borderColor: selected ? 'var(--ink)' : undefined,
        boxShadow: selected ? '0 0 0 1px var(--ink), var(--shadow-float)' : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="studio-port" />
      <Handle type="source" position={Position.Right} className="studio-port" />

      {commentCount > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onComment(e.clientX, e.clientY);
          }}
          className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1.5 rounded-md font-mono text-[10px] font-semibold flex items-center justify-center cursor-pointer"
          style={{ background: 'var(--ink)', color: '#ffffff' }}
          title="查看锚定评论"
        >
          {commentCount}
        </button>
      )}

      <div className="flex items-center gap-2.5 mb-2">
        <span className={`type-icon-box ${spec.kind} w-[30px] h-[30px]`}>
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[13.5px] leading-tight truncate">{spec.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {KIND_LABELS[spec.kind]} · {spec.ruleCount}r
            </span>
            <span className={`hardness-pill ${spec.hardness}`}>
              {HARDNESS_LABELS[spec.hardness]}
            </span>
          </div>
        </div>
      </div>

      {isDetail ? (
        <div className="studio-card-warm px-2.5 py-2 mb-2.5 text-[11.5px] leading-relaxed">
          <div style={{ color: 'var(--text-secondary)' }}>{spec.summary}</div>
          {spec.reqPreview.length > 0 && (
            <div
              className="mt-1.5 font-mono text-[10px] truncate"
              style={{ color: 'var(--text-muted)' }}
            >
              {spec.reqPreview.join(' / ')}
            </div>
          )}
        </div>
      ) : (
        <div
          className="text-[12px] leading-relaxed studio-clamp-2 min-h-[36px] mb-2"
          style={{ color: 'var(--text-secondary)' }}
        >
          {spec.summary}
        </div>
      )}

      <div
        className="flex items-center justify-between pt-2 border-t text-[10.5px]"
        style={{ borderColor: 'var(--surface-subtle)' }}
      >
        <span className="font-mono truncate max-w-[140px]" style={{ color: 'var(--text-muted)' }}>
          {spec.tags[0] ?? (isDetail ? spec.file.split('/').pop() : `#${spec.kind}`)}
        </span>
        <div className="mini-act-row inline-flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10.5px] font-medium cursor-pointer transition-colors hover:bg-[#14171f] hover:text-white hover:border-[#14171f]"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-secondary)',
            }}
          >
            <ExternalLink size={10} />
            <span>进入 Tab</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function StickyNoteNode({ data }: NodeProps<Node<StickyNoteNodeData>>) {
  return (
    <div
      className="w-[210px] rounded-lg border p-2.5 shadow-sm"
      style={{
        background: 'var(--paper-warm)',
        borderColor: '#d9cfb8',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold"
          style={{ color: 'var(--text-muted)' }}
        >
          <StickyNote size={10} />
          <span>草稿便签</span>
        </span>
        <button
          type="button"
          onClick={data.onDelete}
          className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
          title="删除便签"
        >
          <X size={11} />
        </button>
      </div>
      <textarea
        rows={3}
        value={data.text}
        onChange={(e) => data.onChange(e.target.value)}
        className="nodrag w-full bg-transparent text-xs outline-none resize-none leading-relaxed select-text"
        style={{ color: 'var(--text-secondary)' }}
      />
    </div>
  );
}

function MachineBoundaryNode({ data }: NodeProps<Node<MachineBoundaryNodeData>>) {
  return (
    <div
      className={`machine-boundary-frame relative pointer-events-none ${data.nested ? 'is-nested' : ''}`}
      style={{ width: data.width, height: data.height }}
    >
      <Handle
        id="portal-in"
        type="target"
        position={Position.Left}
        className="opacity-0 pointer-events-none"
      />
      <Handle
        id="portal-out"
        type="source"
        position={Position.Right}
        className="opacity-0 pointer-events-none"
      />
      <div
        className="absolute left-3.5 -top-[13px] inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border font-mono text-[10.5px] font-semibold"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <Workflow size={11} style={{ color: 'var(--t-machine)' }} />
        <span>当前状态机边界 · {data.title}</span>
        <span className="opacity-65">{data.file}</span>
      </div>
    </div>
  );
}

function PortalPillNode({ data }: NodeProps<Node<PortalPillNodeData>>) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        data.onPreview(e.clientX, e.clientY);
      }}
      className="nodrag nopan pointer-events-auto rounded-lg border border-dashed px-3 py-2 flex items-center gap-2 text-xs cursor-pointer transition-all hover:border-solid hover:scale-[1.02]"
      style={{
        width: 156,
        background: 'var(--surface)',
        borderColor: 'var(--border-strong)',
        boxShadow: 'var(--shadow-card)',
      }}
      title={`点击查看与 ${data.capId} 的跨能力契约证据`}
    >
      <Handle type="target" position={Position.Left} className="opacity-0 pointer-events-none" />
      <Handle type="source" position={Position.Right} className="opacity-0 pointer-events-none" />
      <div className="text-left min-w-0">
        <div className="font-mono font-semibold text-[11.5px] truncate">{data.capId}</div>
        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {data.direction === 'upstream' ? '← 上游约束' : '下游调用 →'}
        </div>
      </div>
    </button>
  );
}

function syncPulseClass(kind: StateNodeData['syncPulse']): string {
  if (kind === 'focus') return 'studio-sync-pulse-focus';
  if (kind === 'ours') return 'studio-sync-pulse-ours';
  if (kind === 'theirs') return 'studio-sync-pulse-theirs';
  return '';
}

function MachineStateNode({ data, selected }: NodeProps<Node<StateNodeData>>) {
  const {
    uid,
    label,
    tier,
    initial,
    terminal,
    isGateway,
    subMachineKey,
    diffBadge,
    simActive,
    hasError,
    commentCount,
    focused,
    syncPulse,
    onDive,
    onInlineEdit,
  } = data;

  const StateIcon = isGateway ? Diamond : initial ? Play : terminal ? Target : CircleDot;
  const iconColor = isGateway
    ? 'var(--t-flow)'
    : initial
      ? 'var(--ink)'
      : terminal
        ? 'var(--t-machine)'
        : 'var(--accent)';

  const borderColor = simActive
    ? 'var(--accent)'
    : hasError
      ? 'var(--red)'
      : syncPulse === 'focus' || focused || selected
        ? 'var(--ink)'
        : syncPulse === 'ours'
          ? 'var(--amber)'
          : syncPulse === 'theirs' || diffBadge === 'added'
            ? 'var(--green)'
            : diffBadge === 'removed'
              ? 'var(--red)'
              : diffBadge === 'changed'
                ? 'var(--amber)'
                : isGateway
                  ? 'var(--t-flow-bd)'
                  : 'var(--border)';

  const bgColor = simActive
    ? 'var(--accent-soft)'
    : syncPulse === 'ours'
      ? 'var(--amber-soft)'
      : syncPulse === 'theirs' || diffBadge === 'added'
        ? 'var(--green-soft)'
        : diffBadge === 'removed'
          ? 'var(--red-soft)'
          : diffBadge === 'changed'
            ? 'var(--amber-soft)'
            : isGateway
              ? 'var(--t-flow-bg)'
              : 'var(--surface)';

  if (tier === 'glyph') {
    return (
      <div
        onDoubleClick={(e) => {
          e.stopPropagation();
          onInlineEdit(e.clientX, e.clientY);
        }}
        className="flex flex-col items-center gap-1.5 cursor-grab select-none"
      >
        <Handle type="target" position={Position.Left} className="studio-port" />
        <Handle type="source" position={Position.Right} className="studio-port" />
        <div
          className={`w-[72px] h-[72px] rounded-[18px] border-2 flex items-center justify-center ${syncPulseClass(syncPulse)}`}
          data-sync-pulse={syncPulse}
          style={{
            borderColor,
            background: initial ? 'var(--ink)' : bgColor,
            color: initial ? '#ffffff' : iconColor,
            boxShadow: syncPulse ? undefined : 'var(--shadow-card)',
          }}
        >
          <StateIcon size={26} />
        </div>
        <div
          className="px-2.5 py-0.5 rounded-md border text-[12px] font-bold whitespace-nowrap"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {label}
        </div>
      </div>
    );
  }

  const isDetail = tier === 'detail';
  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        onInlineEdit(e.clientX, e.clientY);
      }}
      className={`studio-card relative cursor-grab active:cursor-grabbing ${subMachineKey ? 'sm-has-sub' : ''} ${syncPulseClass(syncPulse)}`}
      data-sync-pulse={syncPulse}
      style={{
        width: isDetail ? 236 : 196,
        padding: isDetail ? '11px 13px' : '10px 12px',
        borderColor,
        background: bgColor,
        borderStyle: diffBadge === 'removed' || syncPulse === 'theirs' ? 'dashed' : 'solid',
        boxShadow: syncPulse
          ? undefined
          : simActive || focused
            ? `0 0 0 2px ${simActive ? 'var(--accent)' : 'var(--ink)'}, var(--shadow-float)`
            : selected
              ? '0 0 0 1px var(--ink), var(--shadow-float)'
              : undefined,
      }}
    >
      <Handle type="target" position={Position.Left} className="studio-port" />
      <Handle type="source" position={Position.Right} className="studio-port" />

      {diffBadge && (
        <span
          className="absolute -top-2.5 left-2 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
          style={{
            background:
              diffBadge === 'added'
                ? 'var(--green)'
                : diffBadge === 'removed'
                  ? 'var(--red)'
                  : 'var(--amber)',
            color: '#ffffff',
          }}
        >
          {diffBadge === 'added' ? '+新增' : diffBadge === 'removed' ? '-移除' : '~调整'}
        </span>
      )}

      {commentCount > 0 && (
        <span
          className="absolute -top-2 -right-2 min-w-[19px] h-[19px] px-1 rounded-md font-mono text-[10px] font-semibold flex items-center justify-center"
          style={{ background: 'var(--ink)', color: '#ffffff' }}
        >
          {commentCount}
        </span>
      )}

      {isDetail && (
        <div
          className="font-mono text-[9.5px] uppercase tracking-wider mb-1 flex items-center justify-between"
          style={{ color: 'var(--text-muted)' }}
        >
          <span>
            {isGateway ? 'GATEWAY' : initial ? 'INITIAL' : terminal ? 'TERMINAL' : 'STATE'}
          </span>
          <span>{uid}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <StateIcon size={14} style={{ color: iconColor }} className="shrink-0" />
        <span
          className="font-bold text-[13px] truncate"
          style={{ textDecoration: diffBadge === 'removed' ? 'line-through' : 'none' }}
        >
          {label}
        </span>
      </div>

      {subMachineKey && onDive && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDive();
          }}
          className="mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold cursor-pointer transition-colors hover:bg-[#2f54eb] hover:text-white"
          style={{
            borderColor: 'var(--accent-border)',
            color: 'var(--accent)',
            background: 'var(--accent-soft)',
          }}
        >
          <Layers size={10} />
          <span>进入子机</span>
        </button>
      )}
    </div>
  );
}

function ObstacleStateEdge({ id, data }: EdgeProps<Edge<ObstacleEdgeData>>) {
  const { zoom } = useViewport();
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  if (!data) return null;
  const {
    dPath,
    lx,
    ly,
    label,
    stroke,
    dashed,
    bendOffset,
    simClickable,
    syncPulse,
    onSimClick,
    onBendDrag,
    onDoubleClick,
  } = data;

  const startBendDrag = (e: MouseEvent): void => {
    if (!onBendDrag) return;
    e.stopPropagation();
    e.preventDefault();
    dragCleanupRef.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    const base = bendOffset ?? { dx: 0, dy: 0 };
    const safeZoom = Math.max(0.25, zoom || 1);
    let moved = false;

    const onMove = (mv: globalThis.MouseEvent): void => {
      const dx = (mv.clientX - startX) / safeZoom;
      const dy = (mv.clientY - startY) / safeZoom;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      onBendDrag({ dx: Math.round(base.dx + dx), dy: Math.round(base.dy + dy) });
    };
    const cleanup = (): void => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      dragCleanupRef.current = null;
    };
    const onUp = (): void => {
      cleanup();
      if (!moved && simClickable && onSimClick) onSimClick();
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <>
      {/* Wide transparent hit area for reliable edge right-click & click */}
      <path d={dPath} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        id={id}
        d={dPath}
        fill="none"
        stroke={stroke}
        strokeWidth={syncPulse === 'focus' ? 3.1 : simClickable ? 2.5 : syncPulse ? 2.4 : 1.85}
        shapeRendering="geometricPrecision"
        strokeDasharray={dashed ? '6 4' : undefined}
        markerEnd="url(#studio-arrow)"
        className={
          syncPulse === 'focus'
            ? 'studio-sync-edge-focus'
            : syncPulse === 'ours'
              ? 'studio-sync-edge-ours'
              : syncPulse === 'theirs'
                ? 'studio-sync-edge-theirs'
                : undefined
        }
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            onMouseDown={startBendDrag}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onDoubleClick?.(e.clientX, e.clientY);
            }}
            data-edge-label=""
            title="按住拖拽微调弧度；双击就地编辑事件与守卫"
            className={`nodrag nopan rounded-md border px-2 py-0.5 text-[10.5px] font-medium select-none ${syncPulseClass(syncPulse)}`}
            data-sync-pulse={syncPulse}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${String(lx)}px, ${String(ly)}px)`,
              pointerEvents: 'all',
              cursor: simClickable ? 'pointer' : 'grab',
              background:
                syncPulse === 'ours'
                  ? 'var(--amber-soft)'
                  : syncPulse === 'theirs'
                    ? 'var(--green-soft)'
                    : simClickable
                      ? 'var(--accent-soft)'
                      : 'var(--surface)',
              borderColor:
                syncPulse === 'focus'
                  ? 'var(--ink)'
                  : syncPulse === 'ours'
                    ? 'var(--amber)'
                    : syncPulse === 'theirs'
                      ? 'var(--green)'
                      : simClickable
                        ? 'var(--accent)'
                        : 'var(--border)',
              color:
                syncPulse === 'ours'
                  ? 'var(--amber)'
                  : syncPulse === 'theirs'
                    ? 'var(--green)'
                    : simClickable
                      ? 'var(--accent)'
                      : 'var(--text-secondary)',
              boxShadow: syncPulse ? undefined : 'var(--shadow-card)',
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const NODE_TYPES = {
  domainGroup: DomainGroupNode,
  specCard: SpecCardNode,
  stickyNote: StickyNoteNode,
  machineBoundary: MachineBoundaryNode,
  portalPill: PortalPillNode,
  stateNode: MachineStateNode,
};
const EDGE_TYPES = { obstacleEdge: ObstacleStateEdge };

function rayToRectBorder(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  targetX: number,
  targetY: number,
  pad = 0,
): { x: number; y: number } {
  const dx = targetX - cx;
  const dy = targetY - cy;
  if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return { x: cx, y: cy };
  const tx = Math.abs(dx) > 1e-4 ? (hw + pad) / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(dy) > 1e-4 ? (hh + pad) / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

/**
 * BFS layered topological layout from initialStateUid:
 * - Places initial state on the left (col 0) and advances columns left-to-right by shortest path depth
 * - Centers sibling nodes vertically per column with generous horizontal spacing (340px) so
 *   transition labels (e.g. `校验通过保存变更 [门禁全绿]`) never clip against neighboring cards
 * - Keeps 2-cycle satellite pairs cleanly stacked above & below their hub column
 */
function defaultMachineLayout(machine: StudioMachineIR): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  if (machine.states.length === 0) return out;

  const initUid =
    machine.initialStateUid ?? machine.transitions[0]?.fromUid ?? machine.states[0]!.uid;
  const depthOf = new Map<string, number>([[initUid, 0]]);
  const queue: string[] = [initUid];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = depthOf.get(cur) ?? 0;
    for (const tr of machine.transitions) {
      if (tr.fromUid === cur && !depthOf.has(tr.toUid)) {
        depthOf.set(tr.toUid, d + 1);
        queue.push(tr.toUid);
      }
    }
  }
  const maxDepth = Math.max(0, ...depthOf.values());
  for (const s of machine.states) {
    if (!depthOf.has(s.uid)) depthOf.set(s.uid, maxDepth + 1);
  }

  // Group states by BFS depth column
  const byCol = new Map<number, string[]>();
  for (const s of machine.states) {
    const col = depthOf.get(s.uid) ?? 0;
    const list = byCol.get(col) ?? [];
    list.push(s.uid);
    byCol.set(col, list);
  }

  // Special ergonomic polish: if a column has exactly 2 nodes that both loop back to the previous
  // column's single hub (like 推演试跑态 & 世界线与验收闭环 around 画布直编与草稿态), stack them
  // directly above & below the hub column to mirror the clean Demo diamond/spine silhouette!
  const colsSorted = [...byCol.keys()].toSorted((a, b) => a - b);
  const colStep = 335;
  const rowStep = 195;
  const centerY = 270;
  let visualCol = 0;

  for (let i = 0; i < colsSorted.length; i += 1) {
    const col = colsSorted[i]!;
    const uids = byCol.get(col)!;
    const prevCol = i > 0 ? colsSorted[i - 1]! : -1;
    const prevUids = prevCol >= 0 ? (byCol.get(prevCol) ?? []) : [];
    const hubUid = prevUids.length === 1 ? prevUids[0]! : null;
    const allLoopBackToHub =
      hubUid !== null &&
      uids.length === 2 &&
      uids.every((u) => machine.transitions.some((t) => t.fromUid === u && t.toUid === hubUid));

    if (allLoopBackToHub && hubUid && out[hubUid]) {
      const hubX = out[hubUid]!.x;
      out[uids[0]!] = { x: hubX, y: centerY - rowStep };
      out[uids[1]!] = { x: hubX, y: centerY + rowStep };
      // Keep visualCol advancing for subsequent columns (e.g., 写保护与保存变更 sits cleanly to the right!)
      continue;
    }

    const x = 140 + visualCol * colStep;
    const totalH = (uids.length - 1) * rowStep;
    uids.forEach((uid, idx) => {
      out[uid] = { x, y: Math.round(centerY - totalH / 2 + idx * rowStep) };
    });
    visualCol += 1;
  }

  return out;
}

interface RadialContextState {
  x: number;
  y: number;
  items: RadialMenuItem[];
}

interface InlineEditorState {
  kind: 'state' | 'edge';
  x: number;
  y: number;
  machineKey: string;
  targetUid: string;
  value: string;
}

function StateMachineCanvasInner() {
  const {
    tabs,
    activeTabId,
    nestStack,
    specs,
    edges: macroEdges,
    stateDoc,
    tier,
    skin,
    edgePreset,
    showMinimap,
    legendKindFilter,
    mode,
    simActiveUid,
    worldlineComparing,
    worldlineCompareAId,
    syncItems,
    syncFocusItemId,
    collapsedGroups,
    ungroupedDomains,
    stickyNotes,
    viewsDoc,
    focusAdjacencyCapId,
    zoomTrigger,
    focusStateUid,
    panelFindOpen,
    panelFindQuery,
    panelFindActiveId,
    setViewportForView,
    clearViewportForView,
    openSpecTab,
    createForestTab,
    addManualGroup,
    addManualLink,
    removeManualLink,
    addLocalTagToCapabilities,
    recordMacroDraftNote,
    setFocusAdjacencyCapId,
    restoreDefaultTabs,
    getActiveForestView,
    diveSubMachine,
    jumpNestLevel,
    updateNodePosition,
    updateEdgeBend,
    resetEdgeBend,
    resetLayoutForScope,
    openCommentPopover,
    openShareModal,
    setDagPanelOpen,
    triggerSimEvent,
    setZoomPercent,
    setFocusStateUid,
    toggleCollapseGroup,
    ungroupDomain,
    addStickyNote,
    updateStickyNote,
    deleteStickyNote,
    connectStates,
    spawnStateAt,
    insertStateOnEdge,
    reverseEdge,
    setInitialState,
    renameState,
    editEdge,
    deleteEdge,
    deleteState,
    toggleGateway,
    getActiveMachineKey,
    getDiagnosticsForMachine,
  } = useStudioStore();

  const rf = useReactFlow();
  const contrastPalette = STUDIO_CONTRAST_PALETTES[skin];
  const [radialMenu, setRadialMenu] = useState<RadialContextState | null>(null);
  const [inlineEditor, setInlineEditor] = useState<InlineEditorState | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedMacroIds, setSelectedMacroIds] = useState<string[]>([]);
  const [batchTagInput, setBatchTagInput] = useState<string | null>(null);
  const [portalPopover, setPortalPopover] = useState<{
    capId: string;
    direction: 'upstream' | 'downstream';
    x: number;
    y: number;
    evidence: ForestEdgeEvidence[];
  } | null>(null);
  const connectingFromRef = useRef<string | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isMacro = !activeTab || activeTab.kind === 'macro' || activeTab.kind === 'forest';
  const activeForestView = getActiveForestView();
  const activeMachineKey = getActiveMachineKey();
  const machine = activeMachineKey ? (stateDoc?.machines[activeMachineKey]?.current ?? null) : null;
  const viewKey = isMacro
    ? activeTab?.kind === 'forest'
      ? `forest:${activeTab.targetId}`
      : 'macro'
    : `machine:${activeMachineKey ?? activeTabId}`;

  const viewKeyRef = useRef(viewKey);
  viewKeyRef.current = viewKey;
  const lastHandledZoomSeqRef = useRef<number>(useStudioStore.getState().zoomTrigger?.seq ?? 0);
  const fittedInitialViewRef = useRef<string | null>(null);
  const pendingUserViewportRef = useRef<{
    viewKey: string;
    vp: { x: number; y: number; zoom: number };
  } | null>(null);
  const [initialViewport] = useState(
    () => useStudioStore.getState().viewports[viewKey] ?? { x: 0, y: 0, zoom: 1 },
  );

  // Bridge BottomChrome Zoom / Fit buttons cleanly to React Flow (seq-guarded so tab switches / remounts never replay stale triggers)
  useEffect(() => {
    if (!zoomTrigger || zoomTrigger.seq <= lastHandledZoomSeqRef.current) return;
    lastHandledZoomSeqRef.current = zoomTrigger.seq;
    const curKey = viewKeyRef.current;
    if (zoomTrigger.action === 'in') {
      void rf.zoomIn({ duration: 160 }).then(() => {
        const vp = rf.getViewport();
        setZoomPercent(Math.round(vp.zoom * 100));
        setViewportForView(curKey, { x: vp.x, y: vp.y, zoom: vp.zoom });
      });
    } else if (zoomTrigger.action === 'out') {
      void rf.zoomOut({ duration: 160 }).then(() => {
        const vp = rf.getViewport();
        setZoomPercent(Math.round(vp.zoom * 100));
        setViewportForView(curKey, { x: vp.x, y: vp.y, zoom: vp.zoom });
      });
    } else {
      clearViewportForView(curKey);
      fittedInitialViewRef.current = curKey;
      void rf.fitView({ padding: 0.18, duration: 220 }).then(() => {
        setZoomPercent(Math.round(rf.getViewport().zoom * 100));
      });
    }
  }, [zoomTrigger, rf, clearViewportForView, setViewportForView, setZoomPercent]);

  // Smoothly focus node when selected from Linter or ⌘K
  useEffect(() => {
    if (!focusStateUid || isMacro) return;
    const node = rf.getNode(focusStateUid);
    if (node) {
      void rf.setCenter(node.position.x + 100, node.position.y + 36, { zoom: 1.05, duration: 260 });
    }
    const t = setTimeout(() => setFocusStateUid(null), 2200);
    return () => clearTimeout(t);
  }, [focusStateUid, isMacro, rf, setFocusStateUid]);

  useEffect(() => {
    if (!syncFocusItemId || isMacro || !machine) return;
    const overlay = computeSyncCanvasOverlay(machine, syncItems, syncFocusItemId);
    let uid = overlay.focusStateUid;
    if (!uid && overlay.focusEdgeUid) {
      const edge =
        machine.transitions.find((t) => t.uid === overlay.focusEdgeUid) ??
        overlay.theirsGhostEdges.find((t) => t.uid === overlay.focusEdgeUid);
      uid = edge?.fromUid ?? null;
    }
    if (!uid) return;
    const node = rf.getNode(uid);
    if (!node) return;
    void rf.setCenter(node.position.x + 100, node.position.y + 36, { zoom: 1.05, duration: 260 });
  }, [syncFocusItemId, isMacro, machine, syncItems, rf]);

  // Smooth-pan to active ⌘F In-Panel Find match on macro / machine canvas
  useEffect(() => {
    if (!panelFindOpen || !panelFindActiveId || !panelFindQuery.trim()) return;
    const node = rf.getNode(panelFindActiveId);
    if (!node) return;
    void rf.setCenter(
      node.position.x + (node.measured?.width ?? 220) / 2,
      node.position.y + (node.measured?.height ?? 120) / 2,
      { zoom: Math.max(0.75, rf.getZoom()), duration: 220 },
    );
  }, [panelFindOpen, panelFindActiveId, panelFindQuery, rf]);

  // Keyboard direct manipulation: Tab quick-create, Delete/Enter, G/T batch macro, Arrow-key cold-table nudge
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (inlineEditor) return;
      if (
        e.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      ) {
        return;
      }
      if (isMacro) {
        if (selectedMacroIds.length >= 2 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (e.key.toLowerCase() === 'g') {
            e.preventDefault();
            addManualGroup(`自定义域 (${selectedMacroIds.length})`, selectedMacroIds);
            setSelectedMacroIds([]);
            return;
          }
          if (e.key.toLowerCase() === 't') {
            e.preventDefault();
            createForestTab(`组合视图 (${selectedMacroIds.length})`, selectedMacroIds);
            setSelectedMacroIds([]);
            return;
          }
        }
        if (selectedMacroIds.length > 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const sample = nudgeCoord({ x: 0, y: 0 }, e.key, e.shiftKey);
          if (sample) {
            e.preventDefault();
            for (const id of selectedMacroIds) {
              const cur = rf.getNode(id)?.position ?? stateDoc?.layouts.__macro__?.[id];
              if (!cur) continue;
              const next = nudgeCoord(cur, e.key, e.shiftKey);
              if (next) updateNodePosition('__macro__', id, next, true);
            }
            return;
          }
        }
        return;
      }
      if (!activeMachineKey || !machine) return;
      if (selectedNodeId && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const cur =
          stateDoc?.layouts[activeMachineKey]?.[selectedNodeId] ??
          defaultMachineLayout(machine)[selectedNodeId];
        const next = cur ? nudgeCoord(cur, e.key, e.shiftKey) : null;
        if (next) {
          e.preventDefault();
          updateNodePosition(activeMachineKey, selectedNodeId, next, true);
          return;
        }
      }
      if (e.key === 'Tab' && selectedNodeId) {
        e.preventDefault();
        const pos = stateDoc?.layouts[activeMachineKey]?.[selectedNodeId] ??
          defaultMachineLayout(machine)[selectedNodeId] ?? { x: 240, y: 180 };
        const newUid = spawnStateAt(
          activeMachineKey,
          machine.graphKind === 'flow' ? '下游步骤' : '新状态',
          { x: pos.x + 280, y: pos.y },
          { connectFromUid: selectedNodeId, event: '流转' },
        );
        if (newUid) setSelectedNodeId(newUid);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        e.preventDefault();
        deleteEdge(activeMachineKey, selectedEdgeId.replace(/-rem$/u, ''));
        setSelectedEdgeId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        deleteState(activeMachineKey, selectedNodeId);
        setSelectedNodeId(null);
      } else if (e.key === 'Enter' && selectedNodeId) {
        const st = machine.states.find((x) => x.uid === selectedNodeId);
        if (st) {
          e.preventDefault();
          setInlineEditor({
            kind: 'state',
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            machineKey: activeMachineKey,
            targetUid: st.uid,
            value: st.name,
          });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    isMacro,
    activeMachineKey,
    machine,
    inlineEditor,
    selectedNodeId,
    selectedEdgeId,
    selectedMacroIds,
    stateDoc,
    rf,
    addManualGroup,
    createForestTab,
    updateNodePosition,
    spawnStateAt,
    deleteEdge,
    deleteState,
  ]);

  // Compute 1:1 live overlay diff when Worldline compare is active
  const liveOverlayDiff = useMemo(() => {
    if (!worldlineComparing || !worldlineCompareAId || !activeMachineKey || !stateDoc) return null;
    const tl = stateDoc.timelines[activeMachineKey];
    const snapA = tl?.entries.find((e) => e.id === worldlineCompareAId)?.snapshot ?? null;
    const snapB = stateDoc.machines[activeMachineKey]?.current ?? null;
    return computeWorldlineOverlayDiff(snapA, snapB);
  }, [worldlineComparing, worldlineCompareAId, activeMachineKey, stateDoc]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!stateDoc) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };

    // ==================== MAIN & CUSTOM FOREST VIEW (EXCLUSIVE DOMAIN GROUPS + SPEC CARDS) ====================
    if (isMacro) {
      let baseSpecs = specs.filter((s) => legendKindFilter.has(s.kind));
      const externalHopSet = new Set<string>();
      if (activeTab?.kind === 'forest' && activeForestView.includedCapabilities.length > 0) {
        const inc = new Set(activeForestView.includedCapabilities);
        if (activeForestView.showExternalHops) {
          for (const extId of computeOneHopExternalCaps(
            activeForestView.includedCapabilities,
            macroEdges,
          )) {
            externalHopSet.add(extId);
            inc.add(extId);
          }
        }
        baseSpecs = baseSpecs.filter((s) => inc.has(s.id));
      }
      if (focusAdjacencyCapId) {
        const adj = computeFocusAdjacencySet(focusAdjacencyCapId, macroEdges);
        baseSpecs = baseSpecs.filter((s) => adj.has(s.id));
      }

      const visibleSpecs = baseSpecs;
      const { groups, ungroupedIds } = buildExclusiveDomainGroupsWithManual(
        visibleSpecs,
        activeForestView.manualGroups,
        ungroupedDomains,
      );
      const savedPos = stateDoc.layouts.__macro__ ?? {};
      const layout = layoutMainViewWithGroups(
        visibleSpecs,
        groups,
        ungroupedIds,
        collapsedGroups,
        savedPos,
        tier,
      );

      // Cross-Forest Bridge Highlight (when bridgeOnly is active and >= 2 groups exist)
      const bridgeResult =
        activeForestView.bridgeOnly && groups.length >= 2
          ? computeCrossForestBridges(
              {
                nodes: visibleSpecs.map((s) => ({ ...s, weight: 1 })),
                edges: macroEdges.map((e) => ({
                  ...e,
                  kind: 'spec-ref' as const,
                  evidence: e.evidence ?? [],
                })),
              },
              groups.map((g) => ({ id: g.id, capabilities: g.memberIds })),
            )
          : null;
      const bridgeNodeSet = bridgeResult ? new Set(bridgeResult.bridgeNodeIds) : null;
      const bridgeEdgeSet = bridgeResult ? new Set(bridgeResult.bridgeEdgeIds) : null;

      const hiddenByCollapse = new Set(
        layout.groupBoxes.filter((g) => g.collapsed).flatMap((g) => g.group.memberIds),
      );
      const cardW = tier === 'glyph' ? 148 : tier === 'detail' ? 304 : 254;
      const cardH = tier === 'glyph' ? 132 : tier === 'detail' ? 218 : 158;

      const groupNodes: Node<DomainGroupNodeData>[] = layout.groupBoxes.map((gb) => ({
        id: `grp:${gb.group.id}`,
        type: 'domainGroup',
        position: { x: gb.x, y: gb.y },
        width: gb.collapsed ? 276 : gb.width,
        height: gb.collapsed ? 128 : gb.height,
        draggable: false,
        selectable: false,
        zIndex: gb.collapsed ? 5 : 0,
        data: {
          groupId: gb.group.id,
          title: gb.group.title,
          tone: gb.group.tone,
          memberIds: gb.group.memberIds,
          width: gb.width,
          height: gb.height,
          collapsed: gb.collapsed,
          onToggleCollapse: () => toggleCollapseGroup(gb.group.id),
          onUngroup: () => ungroupDomain(gb.group.id),
          onOpenFirst: () => {
            const first = visibleSpecs.find((s) => s.id === gb.group.memberIds[0]);
            if (first) void openSpecTab(first);
          },
        },
      }));

      const specNodes: Node<SpecNodeData>[] = visibleSpecs
        .filter((sp) => !hiddenByCollapse.has(sp.id))
        .map((sp) => {
          const pos = layout.specPositions[sp.id] ?? { x: 80, y: 80 };
          const cCount = stateDoc.comments.filter(
            (c) =>
              c.status === 'open' && c.anchor.kind === 'forest' && c.anchor.capability === sp.id,
          ).length;
          const dimmed = bridgeNodeSet !== null && !bridgeNodeSet.has(sp.id);
          return {
            id: sp.id,
            type: 'specCard',
            position: pos,
            width: cardW,
            height: cardH,
            zIndex: 4,
            style: dimmed ? { opacity: 0.22 } : undefined,
            data: {
              spec: sp,
              tier,
              commentCount: cCount,
              dimmed,
              externalHop: externalHopSet.has(sp.id),
              onOpen: () => void openSpecTab(sp),
              onComment: (x, y) =>
                openCommentPopover({ kind: 'forest', capability: sp.id }, sp.title, x, y),
            },
          };
        });

      const noteNodes: Node<StickyNoteNodeData>[] = stickyNotes.map((n) => ({
        id: n.id,
        type: 'stickyNote',
        position: { x: n.x, y: n.y },
        width: 210,
        height: 112,
        zIndex: 8,
        data: {
          id: n.id,
          text: n.text,
          onChange: (txt) => updateStickyNote(n.id, txt),
          onDelete: () => deleteStickyNote(n.id),
        },
      }));

      const placedSegments: Segment2D[] = [];
      const placedLabels: RectBox[] = [];
      const flowE: Edge<ObstacleEdgeData>[] = [];
      const combinedMacroEdges = [
        ...macroEdges.map((me) => ({ ...me, isManual: false })),
        ...activeForestView.manualLinks.map((ml) => ({
          id: ml.id,
          from: ml.fromCap,
          to: ml.toCap,
          label: ml.label ?? '人工参考',
          kind: 'manual' as const,
          isManual: true,
        })),
      ];
      for (const me of combinedMacroEdges) {
        if (hiddenByCollapse.has(me.from) || hiddenByCollapse.has(me.to)) continue;
        const aPos = layout.specPositions[me.from];
        const bPos = layout.specPositions[me.to];
        if (!aPos || !bPos) continue;
        const ax = aPos.x + cardW / 2;
        const ay = aPos.y + cardH / 2;
        const bx = bPos.x + cardW / 2;
        const by = bPos.y + cardH / 2;
        const obs: RectBox[] = visibleSpecs
          .filter((os) => os.id !== me.from && os.id !== me.to && !hiddenByCollapse.has(os.id))
          .map((os) => {
            const p = layout.specPositions[os.id]!;
            return { x1: p.x - 4, y1: p.y - 4, x2: p.x + cardW + 4, y2: p.y + cardH + 4 };
          });
        const bendOffset = stateDoc.edgeBends?.__macro__?.[me.id];
        const geom = routeObstacleAwareEdge({
          sx: ax,
          sy: ay,
          tx: bx,
          ty: by,
          preset: edgePreset as EdgePreset,
          obstacles: obs,
          endpoints: {
            ax,
            ay,
            bx,
            by,
            hwA: cardW / 2,
            hhA: cardH / 2,
            hwB: cardW / 2,
            hhB: cardH / 2,
          },
          placedSegments,
          manualOffset: bendOffset,
        });
        for (let i = 0; i < geom.samplePts.length - 1; i += 1) {
          placedSegments.push([geom.samplePts[i]!, geom.samplePts[i + 1]!]);
        }
        const allMacroBoxes: RectBox[] = visibleSpecs
          .filter((os) => !hiddenByCollapse.has(os.id))
          .map((os) => {
            const p = layout.specPositions[os.id]!;
            return { x1: p.x - 4, y1: p.y - 4, x2: p.x + cardW + 4, y2: p.y + cardH + 4 };
          });
        const lp = resolveLabelPosition(
          geom.lx,
          geom.ly,
          me.label.length * 7 + 16,
          20,
          placedLabels,
          allMacroBoxes,
        );
        const isBridge = bridgeEdgeSet !== null && bridgeEdgeSet.has(me.id);
        const edgeDimmed = bridgeEdgeSet !== null && !isBridge;
        flowE.push({
          id: me.id,
          source: me.from,
          target: me.to,
          type: 'obstacleEdge',
          style: edgeDimmed ? { opacity: 0.18 } : undefined,
          data: {
            label: me.label,
            dPath: geom.d,
            lx: lp.lx,
            ly: lp.ly,
            stroke: isBridge
              ? '#2f54eb'
              : me.isManual
                ? contrastPalette.edgeManual
                : contrastPalette.edgeDefault,
            dashed: me.isManual,
            bendOffset,
            onBendDrag: (next) => updateEdgeBend('__macro__', me.id, next),
          },
        });
      }

      return { flowNodes: [...groupNodes, ...specNodes, ...noteNodes], flowEdges: flowE };
    }

    // ==================== STATE MACHINE / FLOWCHART VIEW (BOX-IN-BOX + PORTALS) ====================
    if (!machine || !activeMachineKey) {
      return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };
    }

    const baseLayout = defaultMachineLayout(machine);
    const savedLayout = stateDoc.layouts[activeMachineKey] ?? {};
    const diags = getDiagnosticsForMachine(activeMachineKey);
    const errorUids = new Set(
      diags
        .filter((d) => d.severity === 'error' && d.targetKind === 'state' && d.targetId)
        .map((d) => d.targetId!),
    );
    const outDegree = new Map<string, number>();
    for (const tr of machine.transitions) {
      outDegree.set(tr.fromUid, (outDegree.get(tr.fromUid) ?? 0) + 1);
    }

    // Pending `drift-trace` 1:1 live canvas overlay (dashed green edges + ghost states)
    const driftOverlay =
      !liveOverlayDiff && activeMachineKey
        ? computeDriftCalibrationOverlay(
            machine,
            getPendingDriftProposals(stateDoc.revisions, activeMachineKey),
          )
        : null;

    const syncOverlay =
      !liveOverlayDiff && !driftOverlay
        ? computeSyncCanvasOverlay(machine, syncItems, syncFocusItemId)
        : null;

    const renderStates = [
      ...machine.states.map((s) => ({ ...s, _removed: false, _drift: false })),
      ...(liveOverlayDiff?.removedStates.map((s) => ({ ...s, _removed: true, _drift: false })) ??
        []),
      ...(driftOverlay?.addedStates.map((s) => ({ ...s, _removed: false, _drift: true })) ?? []),
      ...(syncOverlay?.theirsGhostStates.map((s) => ({ ...s, _removed: false, _drift: true })) ??
        []),
    ];
    const renderEdges = [
      ...machine.transitions.map((t) => ({
        ...t,
        _removed: false,
        _drift: false,
      })),
      ...(liveOverlayDiff?.removedEdges.map((t) => ({ ...t, _removed: true, _drift: false })) ??
        []),
      ...(driftOverlay?.addedEdges.map((t) => ({ ...t, _removed: false, _drift: true })) ?? []),
      ...(syncOverlay?.theirsGhostEdges.map((t) => ({ ...t, _removed: false, _drift: true })) ??
        []),
    ];

    const nodeW = tier === 'glyph' ? 110 : tier === 'detail' ? 236 : 196;
    const heightOfState = (s: { subMachineKey?: string }): number => {
      if (tier === 'glyph') return 104;
      const baseH = tier === 'detail' ? 64 : 42;
      return s.subMachineKey ? baseH + 28 : baseH;
    };
    const posByUid = new Map<string, { x: number; y: number }>();
    const sizeByUid = new Map<string, { w: number; h: number }>();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    renderStates.forEach((s, idx) => {
      const p = savedLayout[s.uid] ??
        baseLayout[s.uid] ?? { x: 180 + (idx % 3) * 310, y: 150 + Math.floor(idx / 3) * 195 };
      const h = heightOfState(s);
      posByUid.set(s.uid, p);
      sizeByUid.set(s.uid, { w: nodeW, h });
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + nodeW);
      maxY = Math.max(maxY, p.y + h);
    });

    const frameX = Number.isFinite(minX) ? minX - 54 : 120;
    const frameY = Number.isFinite(minY) ? minY - 56 : 96;
    const frameW = Number.isFinite(maxX) ? maxX - frameX + 54 : 680;
    const frameH = Number.isFinite(maxY) ? maxY - frameY + 56 : 420;

    const boundaryNode: Node<MachineBoundaryNodeData> = {
      id: '__machine_boundary__',
      type: 'machineBoundary',
      position: { x: frameX, y: frameY },
      width: frameW,
      height: frameH,
      draggable: false,
      selectable: false,
      zIndex: 0,
      data: {
        title: `${machine.capability} · ${machine.ruleTitle}`,
        file: stateDoc.machines[activeMachineKey]?.sourceFile ?? '',
        width: frameW,
        height: frameH,
        nested: nestStack.length > 0,
      },
    };

    // Upstream & Downstream Portal Ghost Pills from cross-spec macroEdges
    const upstreamCaps = Array.from(
      new Set(macroEdges.filter((e) => e.to === machine.capability).map((e) => e.from)),
    ).slice(0, 3);
    const downstreamCaps = Array.from(
      new Set(macroEdges.filter((e) => e.from === machine.capability).map((e) => e.to)),
    ).slice(0, 3);

    const portalNodes: Node<PortalPillNodeData>[] = [
      ...upstreamCaps.map((cap, idx) => ({
        id: `portal:up:${cap}`,
        type: 'portalPill' as const,
        position: {
          x: frameX - 224,
          y: frameY + Math.max(48, frameH / 2 - ((upstreamCaps.length - 1) * 86) / 2) + idx * 86,
        },
        width: 156,
        height: 52,
        draggable: false,
        selectable: false,
        zIndex: 6,
        data: {
          direction: 'upstream' as const,
          capId: cap,
          label: cap,
          onPreview: (x: number, y: number) =>
            setPortalPopover({
              capId: cap,
              direction: 'upstream',
              x,
              y,
              evidence: extractPortalEvidence(machine.capability, 'upstream', cap, macroEdges),
            }),
        },
      })),
      ...downstreamCaps.map((cap, idx) => ({
        id: `portal:dn:${cap}`,
        type: 'portalPill' as const,
        position: {
          x: frameX + frameW + 64,
          y: frameY + Math.max(48, frameH / 2 - ((downstreamCaps.length - 1) * 86) / 2) + idx * 86,
        },
        width: 156,
        height: 52,
        draggable: false,
        selectable: false,
        zIndex: 6,
        data: {
          direction: 'downstream' as const,
          capId: cap,
          label: cap,
          onPreview: (x: number, y: number) =>
            setPortalPopover({
              capId: cap,
              direction: 'downstream',
              x,
              y,
              evidence: extractPortalEvidence(machine.capability, 'downstream', cap, macroEdges),
            }),
        },
      })),
    ];

    // Cross-boundary dashed connector edges linking Portals to Machine Boundary frame
    const portalEdges: Edge<ObstacleEdgeData>[] = [
      ...upstreamCaps.map((cap, idx) => {
        const py =
          frameY + Math.max(48, frameH / 2 - ((upstreamCaps.length - 1) * 86) / 2) + idx * 86 + 26;
        const sx = frameX - 66;
        const tx = frameX - 3;
        return {
          id: `portal-edge:up:${cap}`,
          source: `portal:up:${cap}`,
          target: '__machine_boundary__',
          targetHandle: 'portal-in',
          type: 'obstacleEdge',
          data: {
            label: '',
            dPath: `M ${Math.round(sx)} ${Math.round(py)} L ${Math.round(tx)} ${Math.round(py)}`,
            lx: (sx + tx) / 2,
            ly: py,
            stroke: contrastPalette.edgeDefault,
            dashed: true,
          },
        };
      }),
      ...downstreamCaps.map((cap, idx) => {
        const py =
          frameY +
          Math.max(48, frameH / 2 - ((downstreamCaps.length - 1) * 86) / 2) +
          idx * 86 +
          26;
        const sx = frameX + frameW + 3;
        const tx = frameX + frameW + 60;
        return {
          id: `portal-edge:dn:${cap}`,
          source: '__machine_boundary__',
          sourceHandle: 'portal-out',
          target: `portal:dn:${cap}`,
          type: 'obstacleEdge',
          data: {
            label: '',
            dPath: `M ${Math.round(sx)} ${Math.round(py)} L ${Math.round(tx)} ${Math.round(py)}`,
            lx: (sx + tx) / 2,
            ly: py,
            stroke: contrastPalette.edgeDefault,
            dashed: true,
          },
        };
      }),
    ];

    const stateNodes: Node<StateNodeData>[] = renderStates.map((s) => {
      const pos = posByUid.get(s.uid)!;
      const sz = sizeByUid.get(s.uid)!;
      const diffBadge: StateNodeData['diffBadge'] = s._removed
        ? 'removed'
        : s._drift || liveOverlayDiff?.addedStateUids.includes(s.uid)
          ? 'added'
          : liveOverlayDiff?.changedStateUids.includes(s.uid)
            ? 'changed'
            : undefined;
      const cCount = stateDoc.comments.filter(
        (c) =>
          c.status === 'open' &&
          c.anchor.kind === 'state' &&
          c.anchor.machineKey === activeMachineKey &&
          c.anchor.stateUid === s.uid,
      ).length;
      const isInit = machine.initialStateUid === s.uid;
      const isTerm = !isInit && (outDegree.get(s.uid) ?? 0) === 0;
      const isSyncOurs = syncOverlay?.oursStateNames.includes(s.name) === true && !s._drift;
      const isSyncTheirs = Boolean(syncOverlay) && s._drift;
      const isSyncFocus = syncOverlay?.focusStateUid === s.uid;
      const syncPulse: StateNodeData['syncPulse'] = isSyncFocus
        ? 'focus'
        : isSyncTheirs
          ? 'theirs'
          : isSyncOurs
            ? 'ours'
            : undefined;
      return {
        id: s.uid,
        type: 'stateNode',
        position: pos,
        width: sz.w,
        height: sz.h,
        zIndex: 4,
        data: {
          uid: s.uid,
          label: s.name,
          tier,
          initial: isInit,
          terminal: isTerm,
          isGateway: s.isGateway === true,
          subMachineKey: s.subMachineKey,
          diffBadge,
          simActive: mode === 'simulate' && simActiveUid === s.uid,
          hasError: errorUids.has(s.uid),
          commentCount: cCount,
          focused: focusStateUid === s.uid,
          syncPulse,
          onDive: s.subMachineKey ? () => diveSubMachine(s.subMachineKey!, s.name) : undefined,
          onInlineEdit: (x, y) => {
            if (s._removed || s._drift) return;
            setInlineEditor({
              kind: 'state',
              x,
              y,
              machineKey: activeMachineKey,
              targetUid: s.uid,
              value: s.name,
            });
          },
        },
      };
    });

    const allStateBoxes: RectBox[] = renderStates.map((os) => {
      const p = posByUid.get(os.uid)!;
      const sz = sizeByUid.get(os.uid)!;
      return { x1: p.x - 4, y1: p.y - 4, x2: p.x + sz.w + 4, y2: p.y + sz.h + 4 };
    });

    const placedSegments: Segment2D[] = [];
    const placedLabels: RectBox[] = [];
    const flowE: Edge<ObstacleEdgeData>[] = [];
    for (const t of renderEdges) {
      const aPos = posByUid.get(t.fromUid);
      const bPos = posByUid.get(t.toUid);
      const aSz = sizeByUid.get(t.fromUid);
      const bSz = sizeByUid.get(t.toUid);
      if (!aPos || !bPos || !aSz || !bSz) continue;
      const ax = aPos.x + aSz.w / 2;
      const ay = aPos.y + aSz.h / 2;
      const bx = bPos.x + bSz.w / 2;
      const by = bPos.y + bSz.h / 2;
      const bendOffset = stateDoc.edgeBends?.[activeMachineKey]?.[t.uid];
      const obs: RectBox[] = renderStates
        .filter((os) => os.uid !== t.fromUid && os.uid !== t.toUid)
        .map((os) => {
          const p = posByUid.get(os.uid)!;
          const sz = sizeByUid.get(os.uid)!;
          return { x1: p.x - 4, y1: p.y - 4, x2: p.x + sz.w + 4, y2: p.y + sz.h + 4 };
        });

      let edgePath: string;
      let rawLx: number;
      let rawLy: number;

      if (t.fromUid === t.toUid) {
        const sx = ax - 24;
        const sy = aPos.y;
        const tx = ax + 24;
        const ty = aPos.y;
        const loopW = 58 + (bendOffset?.dx ?? 0);
        const loopH = 66 - (bendOffset?.dy ?? 0);
        edgePath = `M ${Math.round(sx)} ${Math.round(sy)} C ${Math.round(sx - loopW)} ${Math.round(sy - loopH)}, ${Math.round(tx + loopW)} ${Math.round(ty - loopH)}, ${Math.round(tx)} ${Math.round(ty)}`;
        rawLx = ax + (bendOffset?.dx ?? 0) * 0.5;
        rawLy = sy - Math.max(26, loopH * 0.85);
      } else {
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy) || 1;
        const sameDirGroup = renderEdges.filter(
          (o) => o.fromUid === t.fromUid && o.toUid === t.toUid,
        );
        const sameDirIdx = sameDirGroup.findIndex((o) => o.uid === t.uid);
        const hasOpp = renderEdges.some(
          (o) => o.uid !== t.uid && o.fromUid === t.toUid && o.toUid === t.fromUid,
        );
        const oppBend = hasOpp ? (Math.abs(dy) > Math.abs(dx) ? 56 : 38) : 0;
        const parallelSpread =
          sameDirGroup.length > 1 ? (sameDirIdx - (sameDirGroup.length - 1) / 2) * 52 : 0;
        const bend = oppBend + parallelSpread;
        const bendX = (-dy / dist) * bend;
        const bendY = (dx / dist) * bend;

        // Exact rectangle-border anchoring (aimed gently toward curve apex so opposing arrows stay separated & flush on card edges!)
        const aimX = (ax + bx) / 2 + bendX * 0.55;
        const aimY = (ay + by) / 2 + bendY * 0.55;
        const startPt = rayToRectBorder(ax, ay, aSz.w / 2, aSz.h / 2, aimX, aimY, 0);
        const endPt = rayToRectBorder(bx, by, bSz.w / 2, bSz.h / 2, aimX, aimY, 4);

        const geom = routeObstacleAwareEdge({
          sx: startPt.x,
          sy: startPt.y,
          tx: endPt.x,
          ty: endPt.y,
          preset: edgePreset as EdgePreset,
          bendX,
          bendY,
          obstacles: obs,
          endpoints: {
            ax,
            ay,
            bx,
            by,
            hwA: aSz.w / 2,
            hhA: aSz.h / 2,
            hwB: bSz.w / 2,
            hhB: bSz.h / 2,
          },
          placedSegments,
          manualOffset: bendOffset,
        });
        for (let i = 0; i < geom.samplePts.length - 1; i += 1) {
          placedSegments.push([geom.samplePts[i]!, geom.samplePts[i + 1]!]);
        }
        edgePath = geom.d;
        rawLx = geom.lx;
        rawLy = geom.ly;
      }

      const label = `${t.event}${t.guard ? ` [${t.guard}]` : ''}`;
      const lblW = label.length * 7.2 + 18;
      // Avoid ALL state cards (including from/to) when placing edge labels!
      const lp = resolveLabelPosition(rawLx, rawLy, lblW, 22, placedLabels, allStateBoxes);
      const isAdded = liveOverlayDiff?.addedEdgeUids.includes(t.uid) === true || t._drift;
      const simClickable =
        mode === 'simulate' && t.fromUid === simActiveUid && !t._removed && !t._drift;
      const isSyncOursEdge = syncOverlay?.oursEdgeUids.includes(t.uid) === true;
      const isSyncTheirsEdge = Boolean(syncOverlay) && t._drift;
      const isSyncFocusEdge = syncOverlay?.focusEdgeUid === t.uid;
      const syncPulse: ObstacleEdgeData['syncPulse'] = isSyncFocusEdge
        ? 'focus'
        : isSyncTheirsEdge
          ? 'theirs'
          : isSyncOursEdge
            ? 'ours'
            : undefined;
      flowE.push({
        id: `${t.uid}${t._removed ? '-rem' : t._drift ? '-drift' : ''}`,
        source: t.fromUid,
        target: t.toUid,
        type: 'obstacleEdge',
        data: {
          label: t._drift ? `[Trace] ${label}` : label,
          dPath: edgePath,
          lx: lp.lx,
          ly: lp.ly,
          stroke: t._removed
            ? '#dc2626'
            : isSyncTheirsEdge || isAdded
              ? '#15803d'
              : isSyncFocusEdge
                ? '#14171f'
                : isSyncOursEdge
                  ? '#9a5b13'
                  : simClickable
                    ? '#2f54eb'
                    : contrastPalette.edgeDefault,
          dashed: t._removed || t._drift,
          machineKey: activeMachineKey,
          edgeUid: t.uid,
          bendOffset,
          simClickable,
          syncPulse,
          onSimClick: () => triggerSimEvent(t.event),
          onBendDrag:
            !t._removed && !t._drift
              ? (next) => updateEdgeBend(activeMachineKey, t.uid, next)
              : undefined,
          onDoubleClick:
            !t._removed && !t._drift
              ? (x, y) =>
                  setInlineEditor({
                    kind: 'edge',
                    x,
                    y,
                    machineKey: activeMachineKey,
                    targetUid: t.uid,
                    value: label,
                  })
              : undefined,
        },
      });
    }

    return {
      flowNodes: [boundaryNode, ...portalNodes, ...stateNodes],
      flowEdges: [...portalEdges, ...flowE],
    };
  }, [
    stateDoc,
    isMacro,
    specs,
    macroEdges,
    legendKindFilter,
    tier,
    skin,
    edgePreset,
    machine,
    activeMachineKey,
    liveOverlayDiff,
    syncItems,
    syncFocusItemId,
    mode,
    simActiveUid,
    collapsedGroups,
    ungroupedDomains,
    stickyNotes,
    viewsDoc,
    activeTab?.kind,
    activeForestView,
    focusAdjacencyCapId,
    nestStack.length,
    focusStateUid,
    openSpecTab,
    openCommentPopover,
    diveSubMachine,
    updateEdgeBend,
    triggerSimEvent,
    getDiagnosticsForMachine,
    toggleCollapseGroup,
    ungroupDomain,
    updateStickyNote,
    deleteStickyNote,
  ]);

  // First-open auto-center + Per-Tab Viewport Memory (survives Doc-tab unmount/remount & browser reload)
  const hasNodes = flowNodes.length > 0;
  useEffect(() => {
    if (!hasNodes) return;
    let raf1 = 0;
    let raf2 = 0;
    const saved = useStudioStore.getState().viewports[viewKey];
    if (saved) {
      fittedInitialViewRef.current = viewKey;
      raf1 = requestAnimationFrame(() => {
        void rf.setViewport(saved, { duration: 0 });
        setZoomPercent(Math.round(saved.zoom * 100));
      });
    } else if (fittedInitialViewRef.current !== viewKey) {
      fittedInitialViewRef.current = viewKey;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          void rf.fitView({ padding: 0.18, duration: 220 }).then(() => {
            setZoomPercent(Math.round(rf.getViewport().zoom * 100));
          });
        });
      });
    }
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      const pending = pendingUserViewportRef.current;
      if (pending && pending.viewKey === viewKey) {
        pendingUserViewportRef.current = null;
        setViewportForView(viewKey, pending.vp);
      }
    };
  }, [viewKey, hasNodes, rf, setZoomPercent, setViewportForView]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const scopeKey = isMacro ? '__macro__' : activeMachineKey;
      if (!scopeKey) return;
      for (const ch of changes) {
        if (
          ch.type === 'position' &&
          ch.position &&
          !ch.id.startsWith('grp:') &&
          !ch.id.startsWith('portal:') &&
          ch.id !== '__machine_boundary__'
        ) {
          if (ch.id.startsWith('note-')) continue;
          updateNodePosition(
            scopeKey,
            ch.id,
            { x: Math.round(ch.position.x), y: Math.round(ch.position.y) },
            ch.dragging === false,
          );
        } else if (ch.type === 'select' && ch.selected) {
          setSelectedNodeId(ch.id);
          setSelectedEdgeId(null);
        }
      }
    },
    [isMacro, activeMachineKey, updateNodePosition],
  );

  // Memoized & shallow-compared selection handler so React Flow's SelectionListener NEVER loops (fixes React #185!)
  const handleSelectionChange = useCallback(
    ({ nodes: selNodes }: { nodes: Node[]; edges: Edge[] }) => {
      const next = isMacro ? selNodes.filter((n) => n.type === 'specCard').map((n) => n.id) : [];
      setSelectedMacroIds((prev) =>
        prev.length === next.length && prev.every((id, idx) => id === next[idx]) ? prev : next,
      );
    },
    [isMacro],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      connectingFromRef.current = null;
      if (!conn.source || !conn.target) return;
      if (isMacro) {
        addManualLink(conn.source, conn.target, '人工参考');
        return;
      }
      if (!activeMachineKey) return;
      connectStates(activeMachineKey, conn.source, conn.target, '流转');
    },
    [isMacro, activeMachineKey, connectStates, addManualLink],
  );

  // Drag-to-Empty-Canvas Dialect-Isolated Radial Spawn (5-in-1 in Macro, 3-in-1 in Machine/Flow)
  const onConnectEnd = useCallback(
    (event: globalThis.MouseEvent | TouchEvent) => {
      const fromUid = connectingFromRef.current;
      connectingFromRef.current = null;
      if (!fromUid) return;
      const targetEl = event.target as HTMLElement | null;
      if (!targetEl?.classList.contains('react-flow__pane')) return;
      const clientX =
        'clientX' in event ? event.clientX : (event.changedTouches[0]?.clientX ?? 400);
      const clientY =
        'clientY' in event ? event.clientY : (event.changedTouches[0]?.clientY ?? 300);
      const flowPos = rf.screenToFlowPosition({ x: clientX, y: clientY });
      if (isMacro) {
        setRadialMenu({
          x: clientX,
          y: clientY,
          items: [
            {
              id: 'draft-machine',
              label: '+ 状态机草稿',
              icon: <Workflow size={12} />,
              onSelect: () => recordMacroDraftNote(`新建状态机规格草稿（由 ${fromUid} 关联引出）`),
            },
            {
              id: 'draft-flow',
              label: '+ 流程图草稿',
              icon: <GitMerge size={12} />,
              onSelect: () => recordMacroDraftNote(`新建流程图规格草稿（由 ${fromUid} 关联引出）`),
            },
            {
              id: 'draft-decision',
              label: '+ 决策表草稿',
              icon: <Table2 size={12} />,
              onSelect: () => recordMacroDraftNote(`新建决策表规格草稿（由 ${fromUid} 关联引出）`),
            },
            {
              id: 'draft-doc',
              label: '+ 规则草稿',
              icon: <FileText size={12} />,
              onSelect: () => recordMacroDraftNote(`新建规则文档草稿（由 ${fromUid} 关联引出）`),
            },
            {
              id: 'draft-note',
              label: '+ 贴便签',
              icon: <StickyNote size={12} />,
              onSelect: () => addStickyNote(Math.round(flowPos.x), Math.round(flowPos.y)),
            },
          ],
        });
        return;
      }
      if (!activeMachineKey || !machine) return;
      const isFlow = machine.graphKind === 'flow';
      setRadialMenu({
        x: clientX,
        y: clientY,
        items: isFlow
          ? [
              {
                id: 'spawn-step',
                label: '新步骤',
                icon: <Plus size={12} />,
                onSelect: () =>
                  spawnStateAt(activeMachineKey, '新步骤', flowPos, {
                    connectFromUid: fromUid,
                    event: '继续',
                  }),
              },
              {
                id: 'spawn-gw',
                label: '条件判断',
                icon: <Diamond size={12} />,
                onSelect: () =>
                  spawnStateAt(activeMachineKey, '条件判断', flowPos, {
                    isGateway: true,
                    connectFromUid: fromUid,
                    event: '判断',
                  }),
              },
              {
                id: 'spawn-end',
                label: '结束节点',
                icon: <Target size={12} />,
                onSelect: () =>
                  spawnStateAt(activeMachineKey, '已完成', flowPos, {
                    connectFromUid: fromUid,
                    event: '完成',
                  }),
              },
            ]
          : [
              {
                id: 'spawn-state',
                label: '普通状态',
                icon: <CircleDot size={12} />,
                onSelect: () =>
                  spawnStateAt(activeMachineKey, '新状态', flowPos, {
                    connectFromUid: fromUid,
                    event: '流转',
                  }),
              },
              {
                id: 'spawn-guard',
                label: '守卫分支',
                icon: <GitBranch size={12} />,
                onSelect: () =>
                  spawnStateAt(activeMachineKey, '分支状态', flowPos, {
                    connectFromUid: fromUid,
                    event: '条件触发',
                    guard: '条件成立',
                  }),
              },
              {
                id: 'spawn-term',
                label: '终态节点',
                icon: <Target size={12} />,
                onSelect: () =>
                  spawnStateAt(activeMachineKey, '已结束', flowPos, {
                    connectFromUid: fromUid,
                    event: '完成',
                  }),
              },
            ],
      });
    },
    [isMacro, activeMachineKey, machine, rf, spawnStateAt, recordMacroDraftNote, addStickyNote],
  );

  // Open Concentric Radial Pie Menu on Blank Pane Right-Click
  const handlePaneContextMenu = (e: MouseEvent | globalThis.MouseEvent): void => {
    e.preventDefault();
    const flowPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (isMacro) {
      setRadialMenu({
        x: e.clientX,
        y: e.clientY,
        items: [
          {
            id: 'add-note',
            label: '贴便签',
            icon: <StickyNote size={12} />,
            onSelect: () => addStickyNote(Math.round(flowPos.x), Math.round(flowPos.y)),
          },
          {
            id: 'fit-view',
            label: '整理并适配',
            icon: <Maximize2 size={12} />,
            onSelect: () => {
              resetLayoutForScope('__macro__');
              clearViewportForView('macro');
              setTimeout(() => void rf.fitView({ padding: 0.18, duration: 220 }), 40);
            },
          },
          {
            id: 'open-dag',
            label: '变更依赖',
            icon: <Network size={12} />,
            onSelect: () => setDagPanelOpen(true),
          },
          {
            id: 'share-macro',
            label: '分享状态',
            icon: <Share2 size={12} />,
            onSelect: () => openShareModal({ kind: 'macro', targetId: 'default', title: '主视图' }),
          },
        ],
      });
      return;
    }

    if (!activeMachineKey || !machine) return;
    const isFlow = machine.graphKind === 'flow';
    setRadialMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          id: 'new-node',
          label: isFlow ? '+ 步骤' : '+ 状态',
          icon: <Plus size={12} />,
          onSelect: () => spawnStateAt(activeMachineKey, isFlow ? '新步骤' : '新状态', flowPos),
        },
        {
          id: 'new-gw-term',
          label: isFlow ? '+ 条件判断' : '+ 终态',
          icon: isFlow ? <Diamond size={12} /> : <Target size={12} />,
          onSelect: () =>
            spawnStateAt(activeMachineKey, isFlow ? '条件判断' : '已结束', flowPos, {
              isGateway: isFlow,
            }),
        },
        {
          id: 'comment-machine',
          label: '留评论',
          icon: <MessageSquare size={12} />,
          onSelect: () =>
            openCommentPopover(
              { kind: 'machine', machineKey: activeMachineKey },
              activeMachineKey,
              e.clientX,
              e.clientY,
            ),
        },
        {
          id: 'reset-machine-layout',
          label: '整理布局',
          icon: <RotateCcw size={12} />,
          onSelect: () => {
            resetLayoutForScope(activeMachineKey);
            clearViewportForView(viewKey);
            setTimeout(() => void rf.fitView({ padding: 0.18, duration: 220 }), 40);
          },
        },
        {
          id: 'share-machine',
          label: '分享状态',
          icon: <Share2 size={12} />,
          onSelect: () =>
            openShareModal({
              kind: 'machine',
              targetId: activeMachineKey,
              title: activeMachineKey,
            }),
        },
      ],
    });
  };

  const commitInlineEditor = (): void => {
    if (!inlineEditor) return;
    const raw = inlineEditor.value.trim();
    if (inlineEditor.kind === 'state') {
      if (raw) renameState(inlineEditor.machineKey, inlineEditor.targetUid, raw);
    } else {
      const m = /^([^[\]]+?)(?:\s*\[([^\]]*)\])?$/u.exec(raw);
      const ev = m?.[1]?.trim() || raw || '流转';
      const gd = m?.[2]?.trim() || undefined;
      editEdge(inlineEditor.machineKey, inlineEditor.targetUid, ev, gd);
    }
    setInlineEditor(null);
  };

  return (
    <div className="w-full h-full relative">
      {/* Box-in-Box Nested Breadcrumb */}
      {nestStack.length > 0 && (
        <div className="fixed top-[56px] left-3 z-30 studio-island inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
          <button
            type="button"
            onClick={() => jumpNestLevel(nestStack.length - 2)}
            className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold cursor-pointer"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            <ArrowLeft size={12} />
            <span>返回上层</span>
          </button>
          <span style={{ color: 'var(--text-muted)' }}>|</span>
          {nestStack.map((step, idx) => (
            <button
              key={step.machineKey}
              type="button"
              onClick={() => jumpNestLevel(idx)}
              className="rounded px-2 py-0.5 cursor-pointer"
              style={{
                fontWeight: idx === nestStack.length - 1 ? 600 : 400,
                background: idx === nestStack.length - 1 ? 'var(--ink)' : 'transparent',
                color: idx === nestStack.length - 1 ? '#ffffff' : 'var(--text-secondary)',
              }}
            >
              {step.label}
            </button>
          ))}
        </div>
      )}

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onConnectStart={(_ev, params) => {
          connectingFromRef.current = params.nodeId ?? null;
        }}
        onConnectEnd={onConnectEnd}
        onPaneClick={() => {
          setRadialMenu(null);
          setPortalPopover(null);
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
        }}
        selectionKeyCode="Shift"
        onSelectionChange={handleSelectionChange}
        onPaneContextMenu={handlePaneContextMenu}
        onMove={(ev, vp) => {
          setZoomPercent(Math.round(vp.zoom * 100));
          if (ev) {
            pendingUserViewportRef.current = {
              viewKey,
              vp: { x: vp.x, y: vp.y, zoom: vp.zoom },
            };
          }
        }}
        onMoveEnd={(ev, vp) => {
          setZoomPercent(Math.round(vp.zoom * 100));
          if (ev) {
            pendingUserViewportRef.current = null;
            setViewportForView(viewKey, { x: vp.x, y: vp.y, zoom: vp.zoom });
          }
        }}
        onEdgeClick={(_ev, edge) => {
          setSelectedEdgeId(edge.id);
          setSelectedNodeId(null);
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          e.stopPropagation();
          if (
            node.id.startsWith('grp:') ||
            node.id.startsWith('portal:') ||
            node.id === '__machine_boundary__' ||
            node.id.startsWith('note-')
          ) {
            return;
          }
          if (isMacro) {
            const sp = specs.find((s) => s.id === node.id);
            if (!sp) return;
            // Strictly zero duplication with card's explicit 「进入 Tab」 button (C5 D3)
            setRadialMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: 'focus-adj',
                  label: focusAdjacencyCapId === sp.id ? '取消聚焦邻接' : '聚焦邻接 (1跳)',
                  icon: <Layers size={12} />,
                  onSelect: () =>
                    setFocusAdjacencyCapId(focusAdjacencyCapId === sp.id ? null : sp.id),
                },
                {
                  id: 'new-tab-from-card',
                  label: '建为 Tab 视图',
                  icon: <Folder size={12} />,
                  onSelect: () => createForestTab(sp.title, [sp.id]),
                },
                {
                  id: 'comment-spec',
                  label: '留评论',
                  icon: <MessageSquare size={12} />,
                  onSelect: () =>
                    openCommentPopover(
                      { kind: 'forest', capability: sp.id },
                      sp.title,
                      e.clientX,
                      e.clientY,
                    ),
                },
                {
                  id: 'share-spec',
                  label: '分享状态',
                  icon: <Share2 size={12} />,
                  onSelect: () =>
                    openShareModal({
                      kind: sp.kind === 'machine' ? 'machine' : 'doc',
                      targetId: sp.machineKeys[0] ?? sp.id,
                      title: sp.title,
                    }),
                },
                {
                  id: 'draft-rename',
                  label: '建议重命名',
                  icon: <Pencil size={12} />,
                  onSelect: () => recordMacroDraftNote(`建议重命名规格「${sp.id}」`),
                },
                {
                  id: 'draft-delete',
                  label: '标记移除草稿',
                  icon: <Trash2 size={12} />,
                  danger: true,
                  onSelect: () => recordMacroDraftNote(`建议下线/移除规格「${sp.id}」`),
                },
              ],
            });
          } else if (activeMachineKey && machine) {
            const st = machine.states.find((x) => x.uid === node.id);
            if (!st) return;
            const anchor: SemanticAnchor = {
              kind: 'state',
              machineKey: activeMachineKey,
              stateUid: st.uid,
            };
            const curPos = stateDoc?.layouts[activeMachineKey]?.[st.uid] ??
              defaultMachineLayout(machine)[st.uid] ?? { x: 240, y: 180 };
            setRadialMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: 'rename',
                  label: '就地改名',
                  icon: <Pencil size={12} />,
                  onSelect: () =>
                    setInlineEditor({
                      kind: 'state',
                      x: e.clientX,
                      y: e.clientY,
                      machineKey: activeMachineKey,
                      targetUid: st.uid,
                      value: st.name,
                    }),
                },
                {
                  id: 'spawn-downstream',
                  label: '速建下游',
                  icon: <ArrowRight size={12} />,
                  onSelect: () =>
                    spawnStateAt(
                      activeMachineKey,
                      machine.graphKind === 'flow' ? '下游步骤' : '新状态',
                      { x: curPos.x + 280, y: curPos.y },
                      { connectFromUid: st.uid, event: '流转' },
                    ),
                },
                {
                  id: 'set-init',
                  label: '设为初态',
                  icon: <Flag size={12} />,
                  onSelect: () => setInitialState(activeMachineKey, st.uid),
                },
                {
                  id: 'toggle-gw',
                  label: st.isGateway ? '转为状态' : '转为判断',
                  icon: <Diamond size={12} />,
                  onSelect: () => toggleGateway(activeMachineKey, st.uid),
                },
                {
                  id: 'comment-state',
                  label: '留评论',
                  icon: <MessageSquare size={12} />,
                  onSelect: () => openCommentPopover(anchor, st.name, e.clientX, e.clientY),
                },
                {
                  id: 'share-state',
                  label: '分享状态',
                  icon: <Share2 size={12} />,
                  onSelect: () =>
                    openShareModal({ kind: 'state', targetId: st.uid, title: st.name }),
                },
                {
                  id: 'del-state',
                  label: '删除节点',
                  icon: <Trash2 size={12} />,
                  danger: true,
                  onSelect: () => deleteState(activeMachineKey, st.uid),
                },
              ],
            });
          }
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          e.stopPropagation();
          const label = String((edge.data as ObstacleEdgeData | undefined)?.label ?? edge.id);
          if (isMacro) {
            const isManual = activeForestView.manualLinks.some((l) => l.id === edge.id);
            setRadialMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: 'comment-macro-edge',
                  label: '留评论',
                  icon: <MessageSquare size={12} />,
                  onSelect: () =>
                    openCommentPopover(
                      { kind: 'macro-edge', edgeId: edge.id },
                      `${edge.source} -> ${edge.target}`,
                      e.clientX,
                      e.clientY,
                    ),
                },
                {
                  id: 'reset-macro-bend',
                  label: '重置弧度',
                  icon: <RotateCcw size={12} />,
                  onSelect: () => resetEdgeBend('__macro__', edge.id),
                },
                ...(isManual
                  ? [
                      {
                        id: 'del-manual-link',
                        label: '删除参考虚线',
                        icon: <Trash2 size={12} />,
                        danger: true,
                        onSelect: () => removeManualLink(edge.id),
                      },
                    ]
                  : []),
              ],
            });
          } else if (activeMachineKey) {
            const edgeUid =
              (edge.data as ObstacleEdgeData | undefined)?.edgeUid ?? edge.id.replace(/-rem$/u, '');
            const midPos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            setRadialMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                {
                  id: 'edit-edge',
                  label: '改事件/守卫',
                  icon: <Pencil size={12} />,
                  onSelect: () =>
                    setInlineEditor({
                      kind: 'edge',
                      x: e.clientX,
                      y: e.clientY,
                      machineKey: activeMachineKey,
                      targetUid: edgeUid,
                      value: label,
                    }),
                },
                {
                  id: 'insert-mid',
                  label: '插中间态',
                  icon: <Plus size={12} />,
                  onSelect: () => insertStateOnEdge(activeMachineKey, edgeUid, midPos),
                },
                {
                  id: 'reverse-edge',
                  label: '反转方向',
                  icon: <ArrowLeftRight size={12} />,
                  onSelect: () => reverseEdge(activeMachineKey, edgeUid),
                },
                {
                  id: 'reset-bend',
                  label: '重置弧度',
                  icon: <RotateCcw size={12} />,
                  onSelect: () => resetEdgeBend(activeMachineKey, edgeUid),
                },
                {
                  id: 'comment-edge',
                  label: '留评论',
                  icon: <MessageSquare size={12} />,
                  onSelect: () =>
                    openCommentPopover(
                      { kind: 'edge', machineKey: activeMachineKey, edgeUid },
                      label,
                      e.clientX,
                      e.clientY,
                    ),
                },
                {
                  id: 'del-edge',
                  label: '删除转移',
                  icon: <Trash2 size={12} />,
                  danger: true,
                  onSelect: () => deleteEdge(activeMachineKey, edgeUid),
                },
              ],
            });
          }
        }}
        defaultViewport={initialViewport}
        minZoom={0.28}
        maxZoom={1.9}
        proOptions={{ hideAttribution: true }}
      >
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker
              id="studio-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill={contrastPalette.edgeDefault} />
            </marker>
          </defs>
        </svg>
        <Background gap={24} size={1.2} color="var(--grid-dot)" />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            nodeBorderRadius={4}
            maskColor="rgba(20, 23, 31, 0.08)"
            nodeColor={(n) => {
              if (n.type === 'domainGroup' || n.type === 'machineBoundary') {
                return 'rgba(148, 163, 184, 0.16)';
              }
              if (n.type === 'portalPill') return '#cbd5e1';
              if (n.type === 'stickyNote') return '#e5d5b5';
              if (n.type === 'specCard') {
                const kind = (n.data as SpecNodeData | undefined)?.spec?.kind;
                if (kind === 'machine') return '#0d7a6c';
                if (kind === 'flow') return '#6d28d9';
                if (kind === 'decision') return '#2f54eb';
                return '#9a5b13';
              }
              if (n.type === 'stateNode') {
                const d = n.data as StateNodeData | undefined;
                if (d?.initial) return '#14171f';
                if (d?.isGateway) return '#6d28d9';
                if (d?.terminal) return '#0d7a6c';
                return '#2f54eb';
              }
              return '#94a3b8';
            }}
            nodeStrokeColor={(n) =>
              n.type === 'domainGroup' || n.type === 'machineBoundary' ? '#cbd5e1' : 'transparent'
            }
          />
        )}
      </ReactFlow>

      {/* Signature Concentric Radial Pie Menu */}
      {radialMenu && (
        <RadialMenu
          x={radialMenu.x}
          y={radialMenu.y}
          items={radialMenu.items}
          onClose={() => setRadialMenu(null)}
        />
      )}

      {/* Shift+Drag Batch Selection Action Bar (Macro / Forest views, C5 D2 + r157 Alignment/Tidy) */}
      {isMacro && selectedMacroIds.length >= 2 && (
        <div className="fixed top-[92px] left-1/2 -translate-x-1/2 z-40 studio-float px-3 py-1.5 flex items-center gap-2 text-xs flex-wrap justify-center max-w-[92vw]">
          <span className="font-semibold">已选中 {selectedMacroIds.length} 项规格</span>
          <button
            type="button"
            onClick={() => {
              addManualGroup(`自定义域 (${selectedMacroIds.length})`, selectedMacroIds);
              setSelectedMacroIds([]);
            }}
            className="rounded-md border px-2 py-0.5 cursor-pointer hover:bg-black/5"
            style={{ borderColor: 'var(--border)' }}
          >
            打包分组 (G)
          </button>
          <button
            type="button"
            onClick={() => {
              createForestTab(`组合视图 (${selectedMacroIds.length})`, selectedMacroIds);
              setSelectedMacroIds([]);
            }}
            className="rounded-md px-2 py-0.5 font-medium cursor-pointer"
            style={{ background: 'var(--ink)', color: '#ffffff' }}
          >
            新建 Tab 视图 (T)
          </button>
          <div className="w-px h-3.5" style={{ background: 'var(--border)' }} />
          {(
            [
              ['left', '左对齐'],
              ['top', '顶对齐'],
              ['centerY', '水平居中'],
            ] as Array<[AlignMode, string]>
          ).map(([alignMode, label]) => (
            <button
              key={alignMode}
              type="button"
              title="仅更新冷表坐标，不污染语义 Diff"
              onClick={() => {
                const cardW = tier === 'glyph' ? 148 : tier === 'detail' ? 304 : 254;
                const cardH = tier === 'glyph' ? 132 : tier === 'detail' ? 218 : 158;
                const boxes: NodeBoxInput[] = selectedMacroIds
                  .map((id) => {
                    const p = rf.getNode(id)?.position ?? stateDoc?.layouts.__macro__?.[id];
                    return p ? { id, x: p.x, y: p.y, width: cardW, height: cardH } : null;
                  })
                  .filter((x): x is NodeBoxInput => x !== null);
                const updated = alignSelectedNodes(boxes, alignMode);
                for (const [id, pos] of Object.entries(updated)) {
                  updateNodePosition('__macro__', id, pos, true);
                }
              }}
              className="rounded-md border px-2 py-0.5 cursor-pointer hover:bg-black/5"
              style={{ borderColor: 'var(--border)' }}
            >
              {label}
            </button>
          ))}
          {selectedMacroIds.length >= 3 &&
            (
              [
                ['horizontal', '水平等距'],
                ['vertical', '垂直等距'],
              ] as Array<[DistributeAxis, string]>
            ).map(([axis, label]) => (
              <button
                key={axis}
                type="button"
                title="仅更新冷表坐标，不污染语义 Diff"
                onClick={() => {
                  const cardW = tier === 'glyph' ? 148 : tier === 'detail' ? 304 : 254;
                  const cardH = tier === 'glyph' ? 132 : tier === 'detail' ? 218 : 158;
                  const boxes: NodeBoxInput[] = selectedMacroIds
                    .map((id) => {
                      const p = rf.getNode(id)?.position ?? stateDoc?.layouts.__macro__?.[id];
                      return p ? { id, x: p.x, y: p.y, width: cardW, height: cardH } : null;
                    })
                    .filter((x): x is NodeBoxInput => x !== null);
                  const updated = distributeSelectedNodes(boxes, axis);
                  for (const [id, pos] of Object.entries(updated)) {
                    updateNodePosition('__macro__', id, pos, true);
                  }
                }}
                className="rounded-md border px-2 py-0.5 cursor-pointer hover:bg-black/5"
                style={{ borderColor: 'var(--border)' }}
              >
                {label}
              </button>
            ))}
          <button
            type="button"
            title="局部网格整理（仅冷表坐标）"
            onClick={() => {
              const cardW = tier === 'glyph' ? 148 : tier === 'detail' ? 304 : 254;
              const cardH = tier === 'glyph' ? 132 : tier === 'detail' ? 218 : 158;
              const boxes: NodeBoxInput[] = selectedMacroIds
                .map((id) => {
                  const p = rf.getNode(id)?.position ?? stateDoc?.layouts.__macro__?.[id];
                  return p ? { id, x: p.x, y: p.y, width: cardW, height: cardH } : null;
                })
                .filter((x): x is NodeBoxInput => x !== null);
              const updated = tidySelectedGrid(boxes);
              for (const [id, pos] of Object.entries(updated)) {
                updateNodePosition('__macro__', id, pos, true);
              }
            }}
            className="rounded-md border px-2 py-0.5 cursor-pointer hover:bg-black/5"
            style={{ borderColor: 'var(--border)' }}
          >
            整理网格
          </button>
          {batchTagInput !== null ? (
            <div className="inline-flex items-center gap-1">
              <input
                autoFocus
                value={batchTagInput}
                onChange={(e) => setBatchTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addLocalTagToCapabilities(selectedMacroIds, batchTagInput);
                    setBatchTagInput(null);
                  } else if (e.key === 'Escape') {
                    setBatchTagInput(null);
                  }
                }}
                placeholder="输入 #tag"
                className="w-24 rounded border px-1.5 py-0.5 font-mono text-[11px] outline-none"
                style={{ borderColor: 'var(--border)' }}
              />
              <button
                type="button"
                onClick={() => {
                  addLocalTagToCapabilities(selectedMacroIds, batchTagInput);
                  setBatchTagInput(null);
                }}
                className="rounded border px-1.5 py-0.5 text-[10px] cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
              >
                确定
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBatchTagInput('')}
              className="rounded-md border px-2 py-0.5 cursor-pointer hover:bg-black/5"
              style={{ borderColor: 'var(--border)' }}
            >
              打 Tag
            </button>
          )}
        </div>
      )}

      {/* Boundary Portal Contract Evidence Popover (C5 D3 / T4) */}
      {portalPopover && (
        <div
          className="fixed z-50 studio-float w-80 p-3 flex flex-col gap-2 text-xs"
          style={{
            left: Math.min(window.innerWidth - 340, Math.max(12, portalPopover.x + 12)),
            top: Math.min(window.innerHeight - 240, Math.max(60, portalPopover.y - 20)),
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono font-semibold text-[11.5px]">
              {portalPopover.direction === 'upstream' ? '← 上游约束门户' : '下游契约门户 →'} ·{' '}
              {portalPopover.capId}
            </div>
            <button
              type="button"
              onClick={() => setPortalPopover(null)}
              className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {portalPopover.evidence.length === 0 ? (
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                通过跨能力规格关联建立上下文门户。
              </div>
            ) : (
              portalPopover.evidence.map((ev, idx) => (
                <div
                  key={`${ev.targetReqId ?? 'ev'}-${String(idx)}`}
                  className="rounded border px-2 py-1.5 text-[11px] leading-snug"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
                >
                  {ev.targetReqId && (
                    <span
                      className="font-mono font-semibold mr-1.5"
                      style={{ color: 'var(--accent)' }}
                    >
                      @req:{ev.targetReqId}
                    </span>
                  )}
                  <span>{ev.summary}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => {
                setPortalPopover(null);
                restoreDefaultTabs();
              }}
              className="rounded border px-2.5 py-1 text-[11px] cursor-pointer hover:bg-black/5"
              style={{ borderColor: 'var(--border)' }}
            >
              回到全景
            </button>
            <button
              type="button"
              onClick={() => {
                const sp = specs.find((x) => x.id === portalPopover.capId);
                setPortalPopover(null);
                if (sp) void openSpecTab(sp);
              }}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[11px] font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <ExternalLink size={11} />
              <span>新 Tab 打开</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Inline Node / Edge Editor (Zero window.prompt!) */}
      {inlineEditor && (
        <div
          className="inline-canvas-editor"
          style={{
            left: Math.min(window.innerWidth - 150, Math.max(150, inlineEditor.x)),
            top: Math.min(window.innerHeight - 90, Math.max(90, inlineEditor.y)),
          }}
        >
          <div
            className="font-mono text-[10px] font-semibold"
            style={{ color: 'var(--text-muted)' }}
          >
            {inlineEditor.kind === 'state'
              ? '就地重命名状态（Enter 确认 · Esc 取消）'
              : '就地编辑事件 [可选守卫]（Enter 确认）'}
          </div>
          <input
            autoFocus
            value={inlineEditor.value}
            onChange={(e) => setInlineEditor({ ...inlineEditor, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitInlineEditor();
              } else if (e.key === 'Escape') {
                setInlineEditor(null);
              }
            }}
            placeholder={
              inlineEditor.kind === 'state' ? '输入状态名称...' : '如: 批准 [金额<=5000]'
            }
            className="w-full rounded-md border px-2 py-1.5 text-xs outline-none"
            style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setInlineEditor(null)}
              className="rounded border px-2 py-0.5 text-[11px] cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={commitInlineEditor}
              className="rounded px-2.5 py-0.5 text-[11px] font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function StateMachineCanvas() {
  return (
    <ReactFlowProvider>
      <StateMachineCanvasInner />
    </ReactFlowProvider>
  );
}
