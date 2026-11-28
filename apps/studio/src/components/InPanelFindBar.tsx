/**
 * Compact In-Panel Find Bar (`⌘F` / `Ctrl+F`, studio-web r159).
 * - Positioned top-right (never occupies the top-center single slot, Axiom 2)
 * - Matches active macro cards, machine states/edges (penetrating L2/L3 sub-machines),
 *   doc rules & decision table cells with `i / N` cycling via Enter / Shift+Enter
 */
import type { SpecDetailResponse, SpecIndexItem, StudioStateDoc } from '@llman-sdd/core/studio';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useStudioStore } from '../store/studioStore.ts';

export interface InPanelMatch {
  id: string;
  kind: 'spec' | 'state' | 'edge' | 'rule' | 'decision';
  targetId: string;
  machineKey?: string;
  nested?: boolean;
  label: string;
}

export function collectInPanelMatches(input: {
  tabKind: string | undefined;
  specs: readonly SpecIndexItem[];
  stateDoc: StudioStateDoc | null;
  activeMachineKey: string | null;
  specDetail: SpecDetailResponse | undefined;
  query: string;
}): InPanelMatch[] {
  const q = input.query.trim().toLowerCase();
  if (!q) return [];
  const matches: InPanelMatch[] = [];

  if (input.tabKind === 'macro' || input.tabKind === 'forest') {
    for (const sp of input.specs) {
      const hay =
        `${sp.id} ${sp.title} ${sp.summary} ${sp.reqPreview.join(' ')} ${sp.tags.join(' ')}`.toLowerCase();
      if (hay.includes(q)) {
        matches.push({ id: `spec:${sp.id}`, kind: 'spec', targetId: sp.id, label: sp.title });
      }
    }
    return matches;
  }

  if (input.tabKind === 'machine' && input.stateDoc && input.activeMachineKey) {
    const visited = new Set<string>();
    const walkMachine = (mk: string, nested: boolean): void => {
      if (visited.has(mk)) return;
      visited.add(mk);
      const machine = input.stateDoc?.machines[mk]?.current;
      if (!machine) return;
      for (const st of machine.states) {
        if (`${st.name} ${st.isGateway ? '条件判断' : ''}`.toLowerCase().includes(q)) {
          matches.push({
            id: `state:${mk}:${st.uid}`,
            kind: 'state',
            targetId: st.uid,
            machineKey: mk,
            nested,
            label: nested ? `${st.name} (子图)` : st.name,
          });
        }
        if (st.subMachineKey) {
          walkMachine(st.subMachineKey, true);
        }
      }
      for (const tr of machine.transitions) {
        const hay = `${tr.event} ${tr.guard ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          matches.push({
            id: `edge:${mk}:${tr.uid}`,
            kind: 'edge',
            targetId: tr.fromUid,
            machineKey: mk,
            nested,
            label: `${tr.event}${tr.guard ? ` [${tr.guard}]` : ''}`,
          });
        }
      }
    };
    walkMachine(input.activeMachineKey, false);
    return matches;
  }

  if (input.tabKind === 'doc' && input.specDetail) {
    for (const rule of input.specDetail.rules) {
      const hay = `${rule.reqId ?? ''} ${rule.title} ${rule.description}`.toLowerCase();
      if (hay.includes(q)) {
        matches.push({
          id: `rule:${rule.reqId ?? rule.title}`,
          kind: 'rule',
          targetId: rule.reqId ?? rule.title,
          label: `${rule.reqId ? `@req:${rule.reqId} ` : ''}${rule.title}`,
        });
      }
    }
    for (const dt of input.specDetail.decisionTables) {
      const hay = `${dt.title} ${dt.headers.join(' ')} ${dt.rows.flat().join(' ')}`.toLowerCase();
      if (hay.includes(q)) {
        matches.push({
          id: `decision:${dt.id}`,
          kind: 'decision',
          targetId: dt.id,
          label: `决策表 · ${dt.title}`,
        });
      }
    }
  }

  return matches;
}

export function InPanelFindBar() {
  const {
    panelFindOpen,
    panelFindQuery,
    tabs,
    activeTabId,
    specs,
    stateDoc,
    specDetails,
    setPanelFindOpen,
    setPanelFindQuery,
    setPanelFindMatches,
    setFocusStateUid,
    openMachineTab,
    getActiveMachineKey,
  } = useStudioStore();
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeMachineKey = getActiveMachineKey();
  const specDetail = activeTab?.kind === 'doc' ? specDetails[activeTab.targetId] : undefined;

  const matches = useMemo(
    () =>
      collectInPanelMatches({
        tabKind: activeTab?.kind,
        specs,
        stateDoc,
        activeMachineKey,
        specDetail,
        query: panelFindQuery,
      }),
    [activeTab?.kind, specs, stateDoc, activeMachineKey, specDetail, panelFindQuery],
  );

  useEffect(() => {
    if (panelFindOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [panelFindOpen]);

  useEffect(() => {
    const safeIdx = matches.length === 0 ? 0 : Math.min(cursor, matches.length - 1);
    if (safeIdx !== cursor) setCursor(safeIdx);
    const active = matches[safeIdx] ?? null;
    setPanelFindMatches(
      matches.map((m) => m.targetId),
      active?.targetId ?? null,
    );
  }, [matches, cursor, setPanelFindMatches]);

  if (!panelFindOpen) return null;

  const jumpToMatch = (idx: number): void => {
    if (matches.length === 0) return;
    const wrapped = (idx + matches.length) % matches.length;
    setCursor(wrapped);
    const hit = matches[wrapped];
    if (!hit) return;
    if ((hit.kind === 'state' || hit.kind === 'edge') && hit.machineKey) {
      if (hit.machineKey !== activeMachineKey) {
        openMachineTab(hit.machineKey, hit.machineKey);
      }
      setFocusStateUid(hit.targetId);
    }
  };

  return (
    <div
      role="search"
      aria-label="面板内搜索"
      className="fixed top-[56px] right-3 z-45 studio-float px-2.5 py-1.5 flex items-center gap-1.5 text-xs"
      style={{ width: 320, maxWidth: 'calc(100vw - 24px)' }}
    >
      <Search size={13} style={{ color: 'var(--text-muted)' }} className="shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={panelFindQuery}
        onChange={(e) => {
          setCursor(0);
          setPanelFindQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            jumpToMatch(e.shiftKey ? cursor - 1 : cursor + 1);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setPanelFindOpen(false);
          }
        }}
        placeholder="面板内查找节点、守卫、规则..."
        className="flex-1 min-w-0 bg-transparent outline-none text-xs"
      />
      <span className="font-mono text-[10.5px] shrink-0" style={{ color: 'var(--text-muted)' }}>
        {matches.length > 0
          ? `${cursor + 1} / ${matches.length}`
          : panelFindQuery.trim()
            ? '0 / 0'
            : ''}
      </span>
      <button
        type="button"
        aria-label="上一条命中"
        disabled={matches.length === 0}
        onClick={() => jumpToMatch(cursor - 1)}
        className="p-0.5 rounded hover:bg-black/5 cursor-pointer disabled:opacity-30"
      >
        <ChevronUp size={13} />
      </button>
      <button
        type="button"
        aria-label="下一条命中"
        disabled={matches.length === 0}
        onClick={() => jumpToMatch(cursor + 1)}
        className="p-0.5 rounded hover:bg-black/5 cursor-pointer disabled:opacity-30"
      >
        <ChevronDown size={13} />
      </button>
      <button
        type="button"
        aria-label="关闭面板内搜索"
        onClick={() => setPanelFindOpen(false)}
        className="p-0.5 rounded hover:bg-black/5 cursor-pointer"
      >
        <X size={13} />
      </button>
    </div>
  );
}
