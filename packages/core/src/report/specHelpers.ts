import { parseCapability } from '../spec/parser.ts';
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

/** Scan all specs under `specsDir` for @req:rN TAGS (not step text) and return the next free id. */
export function nextReqId(io: SpecHelperIo, specsDir: string): string {
  let max = 0;
  const walk = (dir: string): void => {
    if (!io.exists(dir)) return;
    for (const name of io.listDir(dir)) {
      const full = `${dir}/${name}`;
      if (name.endsWith('.feature')) {
        const doc = parseCapability(io.readText(full), full);
        for (const scenario of doc.scenarios) {
          for (const reqId of scenario.reqIds) {
            max = Math.max(max, Math.trunc(Number(reqId.replace(/^r/u, ''))));
          }
        }
      } else if (io.isDirectory(full)) {
        walk(full);
      }
    }
  };
  walk(specsDir);
  return `r${max + 1}`;
}

export function skeletonContent(capability: string, reqId: string, locale: string): string {
  const zh = localeFallbacks(locale)[0] === 'zh-Hans';
  const header = zh
    ? `# language: zh-CN\n# capability: ${capability}\n# purpose: TODO: 一句话描述该能力与其目的。\n# scope: src/`
    : `# language: en\n# capability: ${capability}\n# purpose: TODO: Describe this capability and its purpose.\n# scope: src/`;
  const feature = zh ? `功能: ${capability}` : `Feature: ${capability}`;
  const scenario = zh ? '场景: TODO-rule' : 'Scenario: TODO-rule';
  return `${header}\n\n${feature}\n\n  @req:${reqId} @human\n  ${scenario}\n    System MUST ...\n`;
}

/** `spec skeleton <cap>`: write llmanspec/specs/<cap>.feature + scaffold scope dir. */
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
  io.mkdirp('src/');
  io.writeText(path, skeletonContent(capability, reqId, locale));
  return path;
}
