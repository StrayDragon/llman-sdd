/**
 * Spec authoring helpers (peripheral-commands capability, r22):
 * skeleton generation + global next req id. Pure, IO injected.
 */
import { localeFallbacks } from '../locale.ts';
import { assignSpecIds } from '../spec/assignSpecIds.ts';
import { officialKeywords, officialKeywordsOrEn } from '../spec/keywords.ts';
import { localeToGherkinLang, parseCapability } from '../spec/parser.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';
import { type FsPort } from '../util/fsPort.ts';
import { discoverFeatureFiles } from '../validation/discover.ts';
import type { SpecEntry } from '../validation/validate.ts';

export type SpecHelperIo = Pick<
  FsPort,
  'exists' | 'readText' | 'writeText' | 'mkdirp' | 'isDirectory' | 'listDir'
>;

function collectSpecEntries(io: SpecHelperIo, specsDir: string): SpecEntry[] {
  // T24: shared discovery — identical ordering/norm as the hash walk.
  const normDir = specsDir.replace(/\\/g, '/').replace(/\/$/u, '');
  const entries = discoverFeatureFiles(normDir, io).map((path) => ({
    fileName: path,
    doc: parseCapability(io.readText(path), path),
  }));
  assignSpecIds(entries, normDir);
  return entries;
}

/**
 * Max+1 over the requirement handles (`@req` on `规则:` headers) only — the id
 * set comes from the global req registry fed with the parsed specs. Deliberately
 * divergent from the predecessor's smallest-free semantics
 * (`req_registry.rs::next_req_id_from_index`): handing out freed ids aliases
 * references archived in past changes (issue #5) — retired ranges are never
 * reused. See change `align-next-req-id-max-plus-one` design for the trade-off.
 */
export function nextReqId(io: SpecHelperIo, specsDir: string): string {
  const entries = collectSpecEntries(io, specsDir);
  const used = [...buildReqRegistry(entries).byId.keys()].map((reqId) =>
    Math.trunc(Number(reqId.replace(/^r/u, ''))),
  );
  return `r${Math.max(0, ...used) + 1}`;
}

export function skeletonContent(capability: string, reqId: string, locale: string): string {
  const zh = localeFallbacks(locale)[0] === 'zh-Hans';
  // r7: the `# language:` header derives from the locale mapping — never a
  // second hardcoded caliber. Table-less locales fall back to en wholesale
  // (header + keywords same-source) so the skeleton stays parseable.
  const mapped = localeToGherkinLang(locale);
  const language = officialKeywords(mapped) !== null ? mapped : 'en';
  const kw = officialKeywordsOrEn(language);
  const header = zh
    ? `# language: ${language}\n# purpose: TODO: 一句话描述该能力与其目的。`
    : `# language: ${language}\n# purpose: TODO: Describe this capability and its purpose.`;
  const ruleDesc = zh ? 'TODO: 需求描述(自由文本)。' : 'TODO: requirement statement (free text).';
  // Skeleton placeholder prose is not vocabulary — the zh/en copy stays; keywords do not.
  const steps = zh
    ? `      ${kw.given} TODO 前置\n      ${kw.when} TODO 动作\n      ${kw.thenText} TODO 断言`
    : `      ${kw.given} TODO precondition\n      ${kw.when} TODO action\n      ${kw.thenText} TODO assertion`;
  // native v2 skeleton: a rule block (with @req handle) + one nested example
  return (
    `${header}\n\n${kw.feature}: ${capability}\n\n  @req:${reqId}\n  ${kw.rule}: TODO-rule\n` +
    `    ${ruleDesc}\n\n    ${kw.scenario}: TODO-acceptance\n${steps}\n`
  );
}

/** `spec skeleton <cap>`: write llmanspec/specs/<cap>.feature (no repo-root src/). */
export function scaffoldSpec(
  io: SpecHelperIo,
  specsDir: string,
  capability: string,
  locale: string,
  opts: { force?: boolean } = {},
): string {
  const reqId = nextReqId(io, specsDir);
  const path = `${specsDir}/${capability}.feature`;
  if (!opts.force && io.exists(path)) throw new Error(`spec already exists: ${path}`);
  io.writeText(path, skeletonContent(capability, reqId, locale));
  return path;
}
