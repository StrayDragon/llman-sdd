/**
 * Pure Tier 0 local CJK-bigram + BM25 search engine for Studio workspaces (studio-core r158).
 * Zero I/O, zero node:*, zero wall-clock calls, zero external dependencies.
 */
import type { CapabilityDoc } from '../spec/ir.ts';
import type { TheoremItem } from '../theorems/theorems.ts';
import { extractDecisionTables } from './decisionTree.ts';
import type { StudioStateDoc } from './model.ts';

export type StudioSearchTargetKind =
  | 'spec'
  | 'rule'
  | 'state'
  | 'edge'
  | 'decision'
  | 'comment'
  | 'timeline'
  | 'theorem';

export interface WorkspaceSearchDocument {
  id: string;
  targetKind: StudioSearchTargetKind;
  targetId: string;
  capId: string;
  machineKey?: string;
  title: string;
  body: string;
}

export interface WorkspaceSearchHit {
  id: string;
  targetKind: StudioSearchTargetKind;
  targetId: string;
  capId: string;
  machineKey?: string;
  title: string;
  snippet: string;
  score: number;
  source: 'local-bm25' | 'rag-serve';
}

const ASCII_TOKEN_RE = /@req:[a-z0-9_-]+|[a-z0-9_@.-]{2,}/giu;
const HAN_RUN_RE = /\p{Script=Han}+/gu;

/**
 * Mixed ASCII + CJK unigram/bigram tokenizer.
 * Keeps `@req:rN` & English identifiers intact while generating overlapping CJK bigrams
 * so Chinese natural phrases recall reliably without an external segmenter.
 */
export function tokenizeSearchText(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  for (const m of lower.matchAll(ASCII_TOKEN_RE)) {
    const tok = m[0].replaceAll(/^[.-]+|[.-]+$/gu, '');
    if (tok.length >= 2) tokens.push(tok);
  }

  for (const m of lower.matchAll(HAN_RUN_RE)) {
    const run = m[0];
    const chars = Array.from(run);
    for (let i = 0; i < chars.length; i += 1) {
      tokens.push(chars[i]!);
      if (i + 1 < chars.length) {
        tokens.push(`${chars[i]!}${chars[i + 1]!}`);
      }
    }
  }
  return tokens;
}

export function extractHighlightSnippet(body: string, query: string, maxLen = 140): string {
  const clean = body.replaceAll(/\s+/gu, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const q = query.trim().toLowerCase();
  const lower = clean.toLowerCase();
  let idx = q.length > 0 ? lower.indexOf(q) : -1;
  if (idx < 0) {
    const terms = tokenizeSearchText(query).sort((a, b) => b.length - a.length);
    for (const term of terms) {
      const pos = lower.indexOf(term);
      if (pos >= 0) {
        idx = pos;
        break;
      }
    }
  }
  if (idx < 0) return `${clean.slice(0, maxLen - 1)}…`;
  const start = Math.max(0, idx - Math.floor(maxLen * 0.35));
  const end = Math.min(clean.length, start + maxLen);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';
  return `${prefix}${clean.slice(start, end)}${suffix}`;
}

export interface SearchableSpecInput {
  capId?: string;
  doc: CapabilityDoc;
}

/** Build workspace-isolated search documents from parsed specs, active stateDoc, and Human Theorems. */
export function buildWorkspaceSearchDocuments(
  specs: readonly SearchableSpecInput[],
  stateDoc?: StudioStateDoc | null,
  theorems?: readonly TheoremItem[],
): WorkspaceSearchDocument[] {
  const docs: WorkspaceSearchDocument[] = [];

  for (const item of specs) {
    const capId = item.capId ?? item.doc.featureName;
    const allTags = item.doc.rules.flatMap((r) => r.tags);
    docs.push({
      id: `spec:${capId}`,
      targetKind: 'spec',
      targetId: capId,
      capId,
      title: capId,
      body: `${capId} ${item.doc.header.purpose ?? ''} ${allTags.join(' ')}`,
    });

    for (const rule of item.doc.rules) {
      const scenarioLines = rule.scenarios.map((sc) =>
        [sc.name, ...sc.steps.map((st) => `${st.kind} ${st.text}`)].join(' '),
      );
      const reqTag = rule.reqId ? `@req:${rule.reqId}` : '';
      docs.push({
        id: `rule:${capId}:${rule.reqId || rule.title}`,
        targetKind: 'rule',
        targetId: rule.reqId || rule.title,
        capId,
        title: `${capId} · ${reqTag ? `${reqTag} ` : ''}${rule.title}`,
        body: [reqTag, rule.title, rule.description, ...scenarioLines].filter(Boolean).join('\n'),
      });
    }

    for (const dt of extractDecisionTables(item.doc)) {
      const cells = [dt.headers.join(' | '), ...dt.rows.map((r) => r.join(' | '))].join('\n');
      docs.push({
        id: `decision:${capId}:${dt.id}`,
        targetKind: 'decision',
        targetId: dt.id,
        capId,
        title: `${capId} · 决策表 · ${dt.title}`,
        body: `${dt.title}\n${cells}`,
      });
    }
  }

  if (stateDoc) {
    for (const [machineKey, draft] of Object.entries(stateDoc.machines)) {
      const machine = draft.current;
      if (!machine) continue;
      for (const st of machine.states) {
        docs.push({
          id: `state:${machineKey}:${st.uid}`,
          targetKind: 'state',
          targetId: st.uid,
          capId: machine.capability,
          machineKey,
          title: `${machine.capability} · 状态 · ${st.name}`,
          body: `${st.name} ${st.isGateway ? '条件判断' : '状态'} ${st.subMachineKey ?? ''} ${machine.ruleTitle}`,
        });
      }
      for (const tr of machine.transitions) {
        const fromName = machine.states.find((s) => s.uid === tr.fromUid)?.name ?? tr.fromUid;
        const toName = machine.states.find((s) => s.uid === tr.toUid)?.name ?? tr.toUid;
        docs.push({
          id: `edge:${machineKey}:${tr.uid}`,
          targetKind: 'edge',
          targetId: tr.uid,
          capId: machine.capability,
          machineKey,
          title: `${machine.capability} · 转移 · ${fromName} → ${toName}`,
          body: `${tr.event} ${tr.guard ? `[${tr.guard}]` : ''} ${fromName} ${toName}`,
        });
      }
      const tl = stateDoc.timelines[machineKey];
      for (const entry of tl?.entries ?? []) {
        docs.push({
          id: `timeline:${machineKey}:${entry.id}`,
          targetKind: 'timeline',
          targetId: entry.id,
          capId: machine.capability,
          machineKey,
          title: `${machine.capability} · 时间线 · ${entry.label}`,
          body: `${entry.label} ${entry.actor ?? 'human'} ${entry.id}`,
        });
      }
    }

    for (const comment of stateDoc.comments ?? []) {
      const capId =
        'capability' in comment.anchor
          ? comment.anchor.capability
          : 'machineKey' in comment.anchor
            ? (comment.anchor.machineKey.split('/')[0] ?? comment.anchor.machineKey)
            : 'workspace';
      const machineKey = 'machineKey' in comment.anchor ? comment.anchor.machineKey : undefined;
      const targetId =
        'stateUid' in comment.anchor
          ? comment.anchor.stateUid
          : 'edgeUid' in comment.anchor
            ? comment.anchor.edgeUid
            : comment.id;
      docs.push({
        id: `comment:${comment.id}`,
        targetKind: 'comment',
        targetId,
        capId,
        ...(machineKey ? { machineKey } : {}),
        title: `评论 (${comment.status === 'open' ? '待处理' : '已解决'}) · ${capId}`,
        body: comment.body,
      });
    }
  }

  if (theorems) {
    for (const th of theorems) {
      docs.push({
        id: `theorem:${th.id}`,
        targetKind: 'theorem',
        targetId: th.id,
        capId: th.file,
        title: `人类定理 · ${th.id} · ${th.title}`,
        body: [
          th.title,
          th.statement,
          th.rationale ?? '',
          th.gate ?? '',
          th.scope ?? '',
          ...th.tags,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    }
  }

  return docs;
}

/** Deterministic BM25 ranking (k1 = 1.2, b = 0.75) with exact-substring bonus. */
export function searchWorkspaceBm25(
  docs: readonly WorkspaceSearchDocument[],
  query: string,
  topK = 20,
): WorkspaceSearchHit[] {
  const trimmed = query.trim();
  if (!trimmed || docs.length === 0) return [];
  const queryTerms = Array.from(new Set(tokenizeSearchText(trimmed)));
  const lowerQuery = trimmed.toLowerCase();

  const tokenizedDocs = docs.map((d) => {
    const titleTokens = tokenizeSearchText(d.title);
    const bodyTokens = tokenizeSearchText(d.body);
    const tf = new Map<string, number>();
    for (const t of titleTokens) tf.set(t, (tf.get(t) ?? 0) + 2);
    for (const t of bodyTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { doc: d, tf, len: titleTokens.length * 2 + bodyTokens.length };
  });

  const N = tokenizedDocs.length;
  const avgLen = Math.max(1, tokenizedDocs.reduce((acc, item) => acc + item.len, 0) / N);
  const df = new Map<string, number>();
  for (const term of queryTerms) {
    let count = 0;
    for (const item of tokenizedDocs) {
      if (item.tf.has(term)) count += 1;
    }
    df.set(term, count);
  }

  const k1 = 1.2;
  const b = 0.75;
  const scored: WorkspaceSearchHit[] = [];

  for (const item of tokenizedDocs) {
    let score = 0;
    for (const term of queryTerms) {
      const freq = item.tf.get(term) ?? 0;
      if (freq === 0) continue;
      const docFreq = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
      const denom = freq + k1 * (1 - b + b * (item.len / avgLen));
      score += idf * ((freq * (k1 + 1)) / denom);
    }
    const titleLower = item.doc.title.toLowerCase();
    const bodyLower = item.doc.body.toLowerCase();
    if (titleLower.includes(lowerQuery)) score += 4;
    else if (bodyLower.includes(lowerQuery)) score += 2;

    if (score > 0) {
      scored.push({
        id: item.doc.id,
        targetKind: item.doc.targetKind,
        targetId: item.doc.targetId,
        capId: item.doc.capId,
        ...(item.doc.machineKey ? { machineKey: item.doc.machineKey } : {}),
        title: item.doc.title,
        snippet: extractHighlightSnippet(item.doc.body, trimmed),
        score: Number(score.toFixed(4)),
        source: 'local-bm25',
      });
    }
  }

  return scored
    .sort((a, bHit) => bHit.score - a.score || a.id.localeCompare(bHit.id))
    .slice(0, Math.max(1, topK));
}
