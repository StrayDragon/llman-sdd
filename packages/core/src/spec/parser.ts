/**
 * Single-track capability .feature parsing (spec-parsing capability).
 *
 * Native v2 model: `功能:` → `规则:` blocks (requirement: title + free-form
 * description + `@req:<id>` handle) → nested `场景:` (executable examples).
 * Top-level `场景:` outside any rule become orphans. Legacy role tags
 * (@human/@rule/@executable/@manual) are inert — the parser only reads
 * `@req` (handle) and `@skip`/`@experimental` (runner opt-out). Files in the
 * legacy flat layout must be migrated with `spec migrate-native`.
 */
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import type { GherkinDocument } from '@cucumber/messages';

import {
  type CapabilityDoc,
  type CapabilityHeader,
  type RuleIR,
  type ScenarioIR,
  type ScenarioStepKind,
  type SpecStructuralError,
} from './ir.ts';
import { stepKeywordToOfficialKind } from './keywords.ts';

export class SpecParseError extends Error {}

let nodeCounter = 0;

export function localeToGherkinLang(locale: string): string {
  return locale === 'zh-Hans' ? 'zh-CN' : locale;
}

const makeIdGenerator = (): (() => string) => {
  const base = ++nodeCounter;
  let i = 0;
  return () => `n-${base}-${++i}`;
};

export function parseFeatureSource(source: string): { doc: GherkinDocument; language: string } {
  let lastError: unknown = null;
  for (const dialect of ['en', 'zh-CN'] as const) {
    try {
      const parser = new Parser(
        new AstBuilder(makeIdGenerator()),
        new GherkinClassicTokenMatcher(dialect),
      );
      return { doc: parser.parse(source), language: dialect };
    } catch (error) {
      lastError = error;
    }
  }
  throw new SpecParseError(
    `gherkin parse failed (tried en, zh-CN): ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/**
 * Unified source-dialect policy (r41/r88): an explicit per-file
 * `# language:` header wins; headerless content is auto-discovered through
 * the official matcher chain (en start, zh-CN fallback); anything still
 * undiscoverable falls back to en. Unknown header names are returned
 * as-is — callers pick vocabulary via officialKeywordsOrEn, and the
 * migration parse self-check fail-closes genuinely broken headers.
 */
export function sourceDialect(source: string): string {
  const firstLine = source.split('\n').find((l) => l.trim() !== '');
  const header = firstLine?.match(/^#\s*language:\s*(\S+)\s*$/u)?.[1];
  if (header !== undefined) return header;
  try {
    return parseFeatureSource(source).language;
  } catch {
    return 'en';
  }
}

const REQ_TAG_RE = /^@?req:(r\d+)$/u;

/** Gherkin keyword → step kind, from the official dialect tables; And/But/* inherit via fallback. */
function stepKeywordToKind(keyword: string): ScenarioStepKind {
  return stepKeywordToOfficialKind(keyword) ?? 'given';
}

const HEADER_RE = /^#\s*(capability|purpose|scope):\s*(.*)$/u;

function extractHeader(source: string): CapabilityHeader {
  const header: CapabilityHeader = { capability: null, purpose: null, scope: null };
  for (const line of source.split('\n')) {
    if (line.trim() === '') continue;
    if (!line.trimStart().startsWith('#')) break;
    const m = line.trimStart().match(HEADER_RE);
    if (m?.[1]) {
      const key = m[1] as 'capability' | 'purpose' | 'scope';
      header[key] = m[2]?.trim() ?? null;
    }
  }
  return header;
}

interface RawTags {
  names: string[]; // without leading '@'
  reqId: string;
}

function parseTags(tags: readonly { name: string }[]): RawTags {
  const names = tags.map((t) => t.name.replace(/^@/u, ''));
  const req = tags.map((t) => t.name.match(REQ_TAG_RE)?.[1]).find((v): v is string => !!v);
  return { names, reqId: req ?? '' };
}

function collectScenario(sc: {
  tags: readonly { name: string }[];
  name: string;
  steps: readonly { keyword: string; text: string }[];
}): ScenarioIR {
  const { names, reqId: _ignored } = parseTags(sc.tags);
  const skipTokens = new Set(['skip', 'experimental']);
  const runnable = !names.some((n) => skipTokens.has(n));
  const steps = sc.steps.map((s) => ({
    kind: stepKeywordToKind(s.keyword),
    text: s.text.trim(),
  }));
  return {
    name: sc.name,
    tags: names.filter(
      (n) =>
        !n.startsWith('req') &&
        !skipTokens.has(n) &&
        !n.startsWith('rule') &&
        !n.startsWith('human') &&
        !n.startsWith('executable'),
    ),
    runnable,
    stepCount: steps.length,
    steps,
    statement: steps.map((s) => s.text).join('\n'),
  };
}

/** Parse one capability .feature source into the native single-track IR. */
export function parseCapability(source: string, fileName = '<inline>'): CapabilityDoc {
  const errors: SpecStructuralError[] = [];
  const header = extractHeader(source);
  for (const key of ['capability', 'purpose', 'scope'] as const) {
    if (header[key] === null) {
      errors.push({ code: `missing-header:${key}`, message: `missing # ${key}: header comment` });
    }
  }

  const { doc, language } = parseFeatureSource(source);
  const feature = doc.feature;
  const featureName = feature?.name ?? '';
  const rules: RuleIR[] = [];
  const orphans: ScenarioIR[] = [];

  for (const child of feature?.children ?? []) {
    const rule = child.rule;
    if (rule) {
      const { names, reqId } = parseTags(rule.tags);
      const description = (rule.description ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '')
        .join('\n');
      const scenarios: ScenarioIR[] = [];
      for (const rc of rule.children) {
        if (rc.scenario) scenarios.push(collectScenario(rc.scenario));
      }
      rules.push({
        reqId,
        title: rule.name,
        description,
        scenarios,
        tags: names.filter(
          (n) => !n.startsWith('req') && !n.startsWith('rule') && !n.startsWith('human'),
        ),
      });
      continue;
    }
    const scenario = child.scenario;
    if (scenario) {
      orphans.push(collectScenario(scenario));
    }
  }

  return { fileName, header, featureName, language, rules, orphans, errors };
}
