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
 * predecessor parity (`req_registry.rs::next_req_id_from_index`): smallest free
 * rN over the requirement handles (`@req` on `规则:` headers) only. The id set
 * comes from the global req registry fed with the parsed specs.
 */
export function nextReqId(io: SpecHelperIo, specsDir: string): string {
  const entries = collectSpecEntries(io, specsDir);
  const used = new Set(
    [...buildReqRegistry(entries).byId.keys()].map((reqId) =>
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
  const ruleKw = zh ? '规则' : 'Rule';
  const scenarioKw = zh ? '场景' : 'Scenario';
  const ruleTitle = 'TODO-rule';
  const ruleDesc = zh ? 'TODO: 需求描述(自由文本)。' : 'TODO: requirement statement (free text).';
  const scTitle = 'TODO-acceptance';
  // native v2 skeleton: a `规则:` block (with @req handle) + one nested example
  return (
    `${header}\n\n${feature}\n\n  @req:${reqId}\n  ${ruleKw}: ${ruleTitle}\n` +
    `    ${ruleDesc}\n\n    ${scenarioKw}: ${scTitle}\n` +
    `      假如 TODO 前置\n      当 TODO 动作\n      那么 TODO 断言\n`
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
