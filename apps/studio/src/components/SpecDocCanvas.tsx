/**
 * Mixed `.feature` Container SpecDocCanvas (Demo Visual Craft, studio-web r145, r146):
 * - Warm-paper 5-level TextFold card synced with BottomChrome's 5-level TextFold Capsule
 * - True left-to-right hierarchical 0-LLM Decision Tree (@xyflow/react) with color-coded outcomes
 * - Clickable Column-Value What-If pill toggles highlighting matched rows in green / dimming misses
 * - Searchable accordion Rules with `全部 | 仅文档` filter, colored hardness pills, & comment triggers
 */
import type { StudioDecisionTableDto } from '@llman-sdd/core/studio';
import { Background, Position, ReactFlow, type Edge, type Node } from '@xyflow/react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  MessageSquare,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Table2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { useStudioStore } from '../store/studioStore.ts';

const FOLD_NAMES = ['全文', '简述', '关键句', '要点', '主题'] as const;

function classifyOutcomeStyle(label: string): {
  border: string;
  background: string;
  color: string;
} {
  if (/(拒|阻|错|禁|fail|reject|block|draft|error)/iu.test(label)) {
    return {
      border: '1.5px solid var(--red-border)',
      background: 'var(--red-soft)',
      color: 'var(--red)',
    };
  }
  if (/(警|待|warn|designed|planned|review)/iu.test(label)) {
    return {
      border: '1.5px solid var(--amber-border)',
      background: 'var(--amber-soft)',
      color: 'var(--amber)',
    };
  }
  return {
    border: '1.5px solid var(--green-border)',
    background: 'var(--green-soft)',
    color: 'var(--green)',
  };
}

/**
 * Deterministic Left-to-Right Hierarchical Tree Layout for 0-LLM DecisionTreeIR.
 * Computes exact BFS depths and leaf-centered vertical coordinates with zero overlap.
 */
function DecisionTreeFlowView({ table }: { table: StudioDecisionTableDto }) {
  const { nodes, edges } = useMemo(() => {
    const childrenOf = new Map<string, string[]>();
    const hasParent = new Set<string>();
    for (const e of table.tree.edges) {
      const list = childrenOf.get(e.from) ?? [];
      list.push(e.to);
      childrenOf.set(e.from, list);
      hasParent.add(e.to);
    }
    const roots = table.tree.nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
    const rootId = roots[0] ?? table.tree.nodes[0]?.id;

    const coords = new Map<string, { x: number; y: number }>();
    let leafRow = 0;
    const colStep = 250;
    const rowStep = 68;

    const place = (id: string, depth: number, visited: Set<string>): number => {
      if (visited.has(id)) return leafRow * rowStep;
      visited.add(id);
      const kids = childrenOf.get(id) ?? [];
      if (kids.length === 0) {
        const y = 32 + leafRow * rowStep;
        leafRow += 1;
        coords.set(id, { x: 32 + depth * colStep, y });
        return y;
      }
      const ys = kids.map((k) => place(k, depth + 1, visited));
      const y = (ys[0]! + ys[ys.length - 1]!) / 2;
      coords.set(id, { x: 32 + depth * colStep, y });
      return y;
    };

    const visited = new Set<string>();
    if (rootId) place(rootId, 0, visited);
    for (const n of table.tree.nodes) {
      if (!coords.has(n.id)) place(n.id, 0, visited);
    }

    const flowN: Node[] = table.tree.nodes.map((n) => {
      const pos = coords.get(n.id) ?? { x: 40, y: 40 };
      const isOutcome = n.kind === 'outcome';
      const outStyle = isOutcome
        ? classifyOutcomeStyle(n.label)
        : {
            border: '1.5px solid var(--accent-border)',
            background: 'var(--accent-soft)',
            color: 'var(--ink)',
          };
      return {
        id: n.id,
        position: pos,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: { label: n.label },
        style: {
          borderRadius: isOutcome ? 999 : 9,
          border: outStyle.border,
          background: outStyle.background,
          color: outStyle.color,
          fontSize: 12,
          fontWeight: 600,
          padding: isOutcome ? '6px 14px' : '7px 13px',
          boxShadow: 'var(--shadow-card)',
        },
      };
    });

    const flowE: Edge[] = table.tree.edges.map((e) => ({
      id: e.id,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      label: e.label,
      style: { stroke: '#8c96a8', strokeWidth: 1.6 },
      labelStyle: { fontSize: 11, fontWeight: 600, fill: '#334155' },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { nodes: flowN, edges: flowE };
  }, [table]);

  return (
    <div
      className="h-72 w-full rounded-xl border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="var(--grid-dot)" />
      </ReactFlow>
    </div>
  );
}

function DecisionTableSection({ table }: { table: StudioDecisionTableDto }) {
  const [dtMode, setDtMode] = useState<'tree' | 'table'>('tree');
  const [selectedConds, setSelectedConds] = useState<Record<number, string>>({});

  // All columns except the final outcome column become interactive What-If condition pills
  const condColCount = Math.max(1, table.headers.length - 1);
  const uniqueByCol = useMemo(() => {
    const res: Array<{ colIdx: number; header: string; values: string[] }> = [];
    for (let c = 0; c < condColCount; c += 1) {
      const vals = Array.from(new Set(table.rows.map((r) => r[c] ?? '').filter((v) => v !== '')));
      res.push({ colIdx: c, header: table.headers[c] ?? `条件${String(c + 1)}`, values: vals });
    }
    return res;
  }, [table, condColCount]);

  const hasActiveWhatIf = Object.keys(selectedConds).length > 0;
  const rowMatches = (row: string[]): boolean =>
    Object.entries(selectedConds).every(([cStr, val]) => row[Number(cStr)] === val);
  const matchedCount = table.rows.filter(rowMatches).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="type-icon-box decision w-6 h-6">
            <Table2 size={13} />
          </span>
          <span>{table.title}</span>
          <span className="font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
            {table.rows.length} 条真值组合 · 0-LLM 确定性投影
          </span>
        </div>
        <div
          className="inline-flex items-center rounded-md p-0.5 text-xs"
          style={{ background: 'var(--surface-subtle)' }}
        >
          <button
            type="button"
            onClick={() => setDtMode('tree')}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1 cursor-pointer"
            style={{
              background: dtMode === 'tree' ? 'var(--ink)' : 'transparent',
              color: dtMode === 'tree' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            <GitBranch size={11} />
            <span>决策树图</span>
          </button>
          <button
            type="button"
            onClick={() => setDtMode('table')}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1 cursor-pointer"
            style={{
              background: dtMode === 'table' ? 'var(--ink)' : 'transparent',
              color: dtMode === 'table' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            <Table2 size={11} />
            <span>真值表 What-If</span>
          </button>
        </div>
      </div>

      {dtMode === 'tree' ? (
        <DecisionTreeFlowView table={table} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Interactive Clickable Column-Value What-If Toggle Bar */}
          <div className="studio-card-warm p-2.5 flex flex-col gap-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11.5px]" style={{ color: 'var(--ink)' }}>
                What-If 条件拨盘（点击组合实时高亮命中规则）
              </span>
              {hasActiveWhatIf && (
                <div className="inline-flex items-center gap-2">
                  <span
                    className="font-mono text-[11px] font-semibold"
                    style={{ color: matchedCount > 0 ? 'var(--green)' : 'var(--red)' }}
                  >
                    命中 {matchedCount}/{table.rows.length} 行
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedConds({})}
                    className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10.5px] cursor-pointer"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
                  >
                    <RotateCcw size={10} />
                    <span>重置</span>
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              {uniqueByCol.map((col) => (
                <div key={col.colIdx} className="inline-flex items-center gap-1 flex-wrap">
                  <span className="font-mono text-[10.5px]" style={{ color: 'var(--text-muted)' }}>
                    {col.header}:
                  </span>
                  {col.values.map((v) => {
                    const active = selectedConds[col.colIdx] === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setSelectedConds((prev) => {
                            const next = { ...prev };
                            if (next[col.colIdx] === v) delete next[col.colIdx];
                            else next[col.colIdx] = v;
                            return next;
                          })
                        }
                        className="rounded-full border px-2 py-0.5 font-mono text-[10.5px] cursor-pointer transition-colors"
                        style={{
                          borderColor: active ? 'var(--accent)' : 'var(--border)',
                          background: active ? 'var(--accent)' : 'var(--surface)',
                          color: active ? '#ffffff' : 'var(--text-secondary)',
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div
            className="overflow-x-auto rounded-xl border"
            style={{ borderColor: 'var(--border)' }}
          >
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr style={{ background: 'var(--surface-subtle)' }}>
                  {table.headers.map((h, hIdx) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2 font-semibold border-b"
                      style={{
                        borderColor: 'var(--border)',
                        color: hIdx === table.headers.length - 1 ? 'var(--accent)' : 'var(--ink)',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rIdx) => {
                  const hit = !hasActiveWhatIf || rowMatches(row);
                  return (
                    <tr
                      key={rIdx}
                      className="border-b last:border-b-0 transition-opacity"
                      style={{
                        borderColor: 'var(--border)',
                        background: hasActiveWhatIf && hit ? 'var(--green-soft)' : 'var(--surface)',
                        opacity: hit ? 1 : 0.3,
                      }}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-3 py-2 font-mono text-[11.5px]"
                          style={{
                            fontWeight: cIdx === row.length - 1 ? 700 : 400,
                            color:
                              cIdx === row.length - 1 && hasActiveWhatIf && hit
                                ? 'var(--green)'
                                : 'var(--ink)',
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export function SpecDocCanvas({ capId }: { capId: string }) {
  const {
    specDetails,
    stateDoc,
    docFoldLevel,
    openCommentPopover,
    openShareModal,
    openPromptWorkbench,
    buildNegotiationPrompt,
    updateDocDraft,
  } = useStudioStore();
  const detail = specDetails[capId];
  const [ruleQuery, setRuleQuery] = useState('');
  const [hardnessFilter, setHardnessFilter] = useState<'all' | 'doc-only'>('all');
  const [expandedRules, setExpandedRules] = useState<Set<number>>(new Set([0]));
  const [editingWording, setEditingWording] = useState(false);

  if (!detail) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-xs"
        style={{ color: 'var(--text-muted)' }}
      >
        正在按需加载规格 {capId} 正文...
      </div>
    );
  }

  const filteredRules = detail.rules.filter((r) => {
    if (hardnessFilter === 'doc-only' && r.hardness !== 'doc') return false;
    if (ruleQuery.trim() === '') return true;
    const q = ruleQuery.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      (r.reqId ?? '').toLowerCase().includes(q)
    );
  });

  const activeDraftText = stateDoc?.docDrafts?.[capId]?.currentText ?? detail.rawText;
  const activeFoldText = detail.foldLevels[docFoldLevel] ?? detail.purpose;

  return (
    <div className="w-full h-full overflow-y-auto pt-[92px] pb-24 px-6 flex justify-center">
      <div className="w-full max-w-4xl studio-card p-6 flex flex-col gap-5 h-fit">
        {/* Header */}
        <div
          className="flex items-start justify-between gap-4 border-b pb-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0 flex items-start gap-3">
            <span
              className={`type-icon-box ${detail.kind === 'decision' ? 'decision' : 'doc'} w-9 h-9 mt-0.5`}
            >
              {detail.kind === 'decision' ? <Table2 size={17} /> : <FileText size={17} />}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold">{detail.id}</h1>
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {detail.file}
                </span>
              </div>
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {detail.purpose || detail.foldLevels[3]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={(e) =>
                openCommentPopover(
                  { kind: 'doc', capability: detail.id },
                  detail.id,
                  e.clientX,
                  e.clientY,
                )
              }
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs cursor-pointer hover:bg-black/5"
              style={{ borderColor: 'var(--border)' }}
            >
              <MessageSquare size={12} />
              <span>评论</span>
            </button>
            <button
              type="button"
              onClick={() => openShareModal({ kind: 'doc', targetId: detail.id, title: detail.id })}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs cursor-pointer hover:bg-black/5"
              style={{ borderColor: 'var(--border)' }}
            >
              <Share2 size={12} />
              <span>分享</span>
            </button>
            <button
              type="button"
              onClick={() => setEditingWording(!editingWording)}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs cursor-pointer hover:bg-black/5"
              style={{
                borderColor: editingWording ? 'var(--ink)' : 'var(--border)',
                background: editingWording ? 'var(--ink)' : 'transparent',
                color: editingWording ? '#ffffff' : 'var(--ink)',
              }}
            >
              <span>{editingWording ? '收起原文' : '编辑原文'}</span>
            </button>
          </div>
        </div>

        {/* 5-Level Warm-Paper TextFold Summary Card (Synced with Bottom-Center Capsule!) */}
        {docFoldLevel > 0 && (
          <div className="studio-card-warm p-3.5 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11.5px]" style={{ color: 'var(--ink)' }}>
                TextFold 折展视图 · L{docFoldLevel} {FOLD_NAMES[docFoldLevel]}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                底栏切换 5 级折展深度
              </span>
            </div>
            <div
              className="whitespace-pre-wrap leading-relaxed select-text"
              style={{ color: 'var(--text-secondary)' }}
            >
              {activeFoldText}
            </div>
          </div>
        )}

        {/* Optional Scheme C Wording Draft Editor */}
        {editingWording && (
          <div
            className="rounded-lg border p-3 flex flex-col gap-2"
            style={{ borderColor: 'var(--accent)', background: 'var(--surface-subtle)' }}
          >
            <div className="text-xs font-medium">
              统一草稿编辑器（自动防抖暂存，点底栏「保存变更」校验分流）
            </div>
            <textarea
              rows={10}
              value={activeDraftText}
              onChange={(e) => updateDocDraft(capId, e.target.value, 'wording')}
              className="w-full rounded border p-2 font-mono text-xs outline-none select-text"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            />
          </div>
        )}

        {/* Deterministic 0-LLM Decision Tables -> Hierarchical Tree / What-If Truth Table Dual View */}
        {detail.decisionTables.map((table) => (
          <DecisionTableSection key={table.id} table={table} />
        ))}

        {/* Searchable Accordion Rules with Hardness Filter */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">
                规则条款（{filteredRules.length}/{detail.rules.length}）
              </h2>
              <div
                className="inline-flex rounded-md p-0.5 text-[11px]"
                style={{ background: 'var(--surface-subtle)' }}
              >
                <button
                  type="button"
                  onClick={() => setHardnessFilter('all')}
                  className="rounded px-2 py-0.5 cursor-pointer"
                  style={{
                    background: hardnessFilter === 'all' ? 'var(--surface)' : 'transparent',
                    fontWeight: hardnessFilter === 'all' ? 600 : 400,
                  }}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => setHardnessFilter('doc-only')}
                  className="rounded px-2 py-0.5 cursor-pointer"
                  style={{
                    background: hardnessFilter === 'doc-only' ? 'var(--surface)' : 'transparent',
                    fontWeight: hardnessFilter === 'doc-only' ? 600 : 400,
                  }}
                >
                  仅文档
                </button>
              </div>
            </div>
            <div className="relative w-64">
              <Search
                size={12}
                className="absolute left-2.5 top-2"
                style={{ color: 'var(--text-muted)' }}
              />
              <input
                value={ruleQuery}
                onChange={(e) => setRuleQuery(e.target.value)}
                placeholder="检索 @req 或规则关键词..."
                className="w-full rounded-md border pl-7 pr-2.5 py-1 text-xs outline-none"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-subtle)' }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {filteredRules.map((rule, idx) => {
              const open = expandedRules.has(idx);
              const hardnessText =
                rule.hardness === 'formal'
                  ? '形式化'
                  : rule.hardness === 'drift-guarded'
                    ? '防漂移'
                    : rule.hardness === 'tested'
                      ? '已绑测试'
                      : '仅文档';
              return (
                <div
                  key={`${rule.reqId ?? ''}-${String(idx)}`}
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div
                    onClick={() => {
                      const next = new Set(expandedRules);
                      if (next.has(idx)) next.delete(idx);
                      else next.add(idx);
                      setExpandedRules(next);
                    }}
                    className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer"
                    style={{ background: 'var(--surface-subtle)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0 text-xs font-medium">
                      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {rule.reqId && (
                        <span
                          className="font-mono text-[10.5px] px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                        >
                          @req:{rule.reqId}
                        </span>
                      )}
                      <span className="truncate">{rule.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {rule.scenarioCount > 0 && (
                        <span
                          className="font-mono text-[10px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {rule.scenarioCount} 场景
                        </span>
                      )}
                      <span className={`hardness-pill ${rule.hardness}`}>{hardnessText}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCommentPopover(
                            {
                              kind: 'doc',
                              capability: detail.id,
                              ...(rule.reqId ? { reqId: rule.reqId } : {}),
                            },
                            `${detail.id} · ${rule.title}`,
                            e.clientX,
                            e.clientY,
                          );
                        }}
                        className="p-1 rounded hover:bg-black/5 cursor-pointer"
                        title="针对此规则留评论"
                      >
                        <MessageSquare size={12} />
                      </button>
                    </div>
                  </div>
                  {open && (
                    <div
                      className="px-3.5 py-2.5 text-xs leading-relaxed flex flex-col gap-2 select-text"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <p className="whitespace-pre-wrap">{rule.description}</p>
                      {rule.scenarios.length > 0 && (
                        <div
                          className="border-t pt-2 flex flex-col gap-1.5"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          {rule.scenarios.map((sc, sIdx) => (
                            <div
                              key={sIdx}
                              className="rounded px-2.5 py-1.5 font-mono text-[11px]"
                              style={{ background: 'var(--surface-subtle)' }}
                            >
                              <div className="font-semibold" style={{ color: 'var(--ink)' }}>
                                场景: {sc.name}
                              </div>
                              {sc.steps.slice(0, 4).map((st, stIdx) => (
                                <div
                                  key={stIdx}
                                  className="pl-2 mt-0.5"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  {st}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Deterministic Convertible Structure Hint */}
        {detail.convertibleHint && (
          <div
            className="rounded-xl border p-3.5 flex items-center justify-between gap-3 text-xs"
            style={{ borderColor: 'var(--amber-border)', background: 'var(--amber-soft)' }}
          >
            <div>
              <div className="font-semibold" style={{ color: 'var(--amber)' }}>
                发现可转图结构：推荐转为
                {detail.convertibleHint.targetKind === 'machine'
                  ? '「状态机」'
                  : detail.convertibleHint.targetKind === 'flow'
                    ? '「流程图」'
                    : '「决策树」'}
              </div>
              <div className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {detail.convertibleHint.reason}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                openPromptWorkbench(
                  '生成转图结构 Prompt',
                  `将 ${detail.id} 中规则整理为可执行图结构`,
                  `${buildNegotiationPrompt()}\n\n附加任务：请评估将 ${detail.file} 转为${detail.convertibleHint?.targetKind ?? 'graph'}结构并补充对应验收场景。`,
                )
              }
              className="shrink-0 inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium cursor-pointer"
              style={{ background: 'var(--ink)', color: '#ffffff' }}
            >
              <Sparkles size={12} />
              <span>生成转图 Prompt</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
