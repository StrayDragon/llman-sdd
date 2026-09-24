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
 * v1 parity (`req_registry.rs::next_req_id_from_index`): smallest free rN over
 * the RULE (@human) req ids only; acceptance-only req tags do not occupy ids.
 * The id set comes from the global req registry (r7 mapping's sibling API in
 * spec/reqRegistry.ts) fed with the human-scenario view of each spec.
 */
export function nextReqId(io: SpecHelperIo, specsDir: string): string {
  const humanOnly = collectSpecEntries(io, specsDir).map((e) => ({
    fileName: e.fileName,
    doc: { ...e.doc, scenarios: e.doc.scenarios.filter((s) => s.classification === 'human') },
  }));
  const used = new Set(
    [...buildReqRegistry(humanOnly).byId.keys()].map((reqId) =>
      Math.trunc(Number(reqId.replace(/^r/u, ''))),
    ),
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return `r${n}`;
}

export function skeletonContent(capability: string, reqId: string, locale: string): string {
  const zh = localeFallbacks(locale)[0] === 'zh-Hans';
  // r7: the `# language:` header derives from the locale mapping — never a
  // second hardcoded caliber.
  const language = localeToGherkinLang(zh ? 'zh-Hans' : 'en');
  const header = zh
    ? `# language: ${language}\n# capability: ${capability}\n# purpose: TODO: 一句话描述该能力与其目的。\n# scope: llmanspec/`
    : `# language: ${language}\n# capability: ${capability}\n# purpose: TODO: Describe this capability and its purpose.\n# scope: llmanspec/`;
  const feature = zh ? `功能: ${capability}` : `Feature: ${capability}`;
  const scenario = zh ? '场景: TODO-rule' : 'Scenario: TODO-rule';
  // keep an ASCII MUST keyword so r9's wording check passes in both locales
  const rule = zh ? '系统 MUST ...' : 'System MUST ...';
  return `${header}\n\n${feature}\n\n  @req:${reqId} @human\n  ${scenario}\n    ${rule}\n`;
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
