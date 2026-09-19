/**
 * Single-track capability .feature parsing (spec-parsing capability).
 *
 * Language fallback chain (r7): start with the `en` matcher — a
 * `# language:` header switches dialect automatically mid-scan; on failure
 * retry with the zh-CN matcher (Chinese keywords without a header); only then
 * surface a parse error. locale zh-Hans maps to gherkin zh-CN.
 */
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import type { GherkinDocument } from '@cucumber/messages';

import {
  MUST_WORD_RE,
  type CapabilityDoc,
  type CapabilityHeader,
  type ScenarioIR,
  type SpecStructuralError,
} from './ir.ts';

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

const REQ_TAG_RE = /^@?req:(r\d+)$/u;

/** Gherkin keyword (zh-CN + en) → step kind; And/But/* inherit via fallback. */
function stepKeywordToKind(keyword: string): 'given' | 'when' | 'then' {
  const kw = keyword.trim();
  if (/^(假如|Given)/iu.test(kw)) return 'given';
  if (/^(当|When)/iu.test(kw)) return 'when';
  if (/^(那么|Then)/iu.test(kw)) return 'then';
  return 'given';
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

function classify(tags: string[]): {
  classification: ScenarioIR['classification'];
  errors: SpecStructuralError[];
} {
  const errors: SpecStructuralError[] = [];
  const has = (t: string): boolean => tags.includes(t);
  const human = has('human');
  const executable = has('executable');
  const label = tags.join(',');

  if (has('manual')) {
    errors.push({
      code: 'tag:manual-removed',
      message: `@manual was removed in 0.3.0 — drop the tag (@human already carries the human-judgement semantics) (tags: ${label})`,
    });
  }
  if (human && executable) {
    errors.push({
      code: 'tag:mutually-exclusive',
      message: `@human 与 @executable 互斥(tags: ${label})`,
    });
  }
  const classification: ScenarioIR['classification'] = human
    ? 'human'
    : executable
      ? 'executable'
      : 'unclassified';
  return { classification, errors };
}

/** Parse one capability .feature source into the single-track IR. */
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
  const scenarios: ScenarioIR[] = [];

  for (const child of feature?.children ?? []) {
    const rule = child.rule;
    if (rule && rule.children.some((c) => c.scenario)) {
      errors.push({
        code: 'rule:nested-scenario',
        message: `Rule 块内嵌场景被拒绝(rule: ${rule.name})`,
      });
      continue;
    }
    const scenario = child.scenario;
    if (!scenario) continue;

    const tags = scenario.tags.map((t) => t.name.replace(/^@/u, ''));
    const reqIds = scenario.tags
      .map((t) => t.name.match(REQ_TAG_RE)?.[1])
      .filter((v): v is string => v !== undefined);

    const kind = classify(tags);
    errors.push(...kind.errors);

    const description = (scenario.description ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '');
    const stepTexts = scenario.steps.map((s) => s.text.trim());
    const statement = [...description, ...stepTexts].join('\n');
    const steps = scenario.steps.map((s) => ({
      kind: stepKeywordToKind(s.keyword),
      text: s.text.trim(),
    }));

    if (kind.classification === 'human' && !MUST_WORD_RE.test(statement)) {
      errors.push({
        code: 'rule:missing-must-word',
        message: `@human 规则场景描述必须含 MUST/SHALL(scenario: ${scenario.name})`,
      });
    }

    scenarios.push({
      name: scenario.name,
      tags,
      reqIds,
      classification: kind.classification,
      statement,
      stepCount: stepTexts.length,
      steps,
    });
  }

  return { fileName, header, featureName, language, scenarios, errors };
}
