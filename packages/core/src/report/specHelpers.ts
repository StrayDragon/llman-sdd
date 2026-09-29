import { officialKeywords, officialKeywordsOrEn } from '../spec/keywords.ts';
import { localeToGherkinLang, parseCapability } from '../spec/parser.ts';
import { buildReqRegistry } from '../spec/reqRegistry.ts';
/**
 * Spec authoring helpers (peripheral-commands capability, r22):
 * skeleton generation + global next req id. Pure, IO injected.
 */
import { localeFallbacks } from '../templates/locale.ts';

export interface SpecHelperIo {
  exists(path: string): boolean;
  readText(path: string): string;
  writeText(path: string, content: string): void;
  mkdirp(path: string): void;
  isDirectory(path: string): boolean;
  listDir(path: string): string[];
}

interface ParsedEntry {
  fileName: string;
  doc: ReturnType<typeof parseCapability>;
}

function collectSpecEntries(io: SpecHelperIo, specsDir: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const walk = (dir: string): void => {
    if (!io.exists(dir)) return;
    for (const name of io.listDir(dir)) {
      const full = `${dir}/${name}`;
      if (name.endsWith('.feature')) {
        entries.push({ fileName: full, doc: parseCapability(io.readText(full), full) });
      } else if (io.isDirectory(full)) {
        walk(full);
      }
    }
  };
  walk(specsDir);
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
    ? `# language: ${language}\n# capability: ${capability}\n# purpose: TODO: 一句话描述该能力与其目的。\n# scope: llmanspec/`
    : `# language: ${language}\n# capability: ${capability}\n# purpose: TODO: Describe this capability and its purpose.\n# scope: llmanspec/`;
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
