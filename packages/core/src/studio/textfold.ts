/**
 * Tier 0 deterministic offline AST 5-level semantic folding for `.feature` specs (studio-web r145).
 * Produces 5 compact levels [0: full, 1: brief, 2: key-clauses, 3: bullets, 4: headline]
 * with zero external dependencies and zero LLM tokens. Pure — zero I/O.
 */
import type { CapabilityDoc } from '../spec/ir.ts';

export type TextfoldLevels = [string, string, string, string, string];

function truncateText(text: string, maxLen: number): string {
  const clean = text.replaceAll(/\s+/gu, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

/** Fold a parsed CapabilityDoc deterministically into 5 progressive semantic summary levels. */
export function foldFeatureAst(doc: CapabilityDoc, rawText = ''): TextfoldLevels {
  const purpose = (doc.header.purpose ?? '').trim() || doc.featureName;
  const ruleCount = doc.rules.length;
  const scenarioCount =
    doc.rules.reduce((sum, r) => sum + r.scenarios.length, 0) + doc.orphans.length;
  const reqIds = doc.rules.map((r) => `@req:${r.reqId}`).filter((id) => id !== '@req:');
  const reqPreview =
    reqIds.length <= 3
      ? reqIds.join(' / ')
      : `${reqIds.slice(0, 3).join(' / ')} 等共 ${String(reqIds.length)} 条`;

  const level4 = truncateText(`${doc.featureName}：${purpose}`, 72);
  const level3 =
    ruleCount > 0
      ? `共 ${String(ruleCount)} 条规格规则、${String(scenarioCount)} 个场景${reqPreview ? `（${reqPreview}）` : ''}。`
      : truncateText(purpose, 110);
  const level2 =
    ruleCount > 0
      ? doc.rules
          .slice(0, 3)
          .map((r) => `@req:${r.reqId} ${r.title}`)
          .join('；') + (ruleCount > 3 ? ` 等共 ${String(ruleCount)} 条规则` : '')
      : truncateText(purpose, 160);
  const level1 =
    ruleCount > 0
      ? `${purpose}\n` +
        doc.rules
          .slice(0, 6)
          .map(
            (r) => `- [@req:${r.reqId}] ${r.title}：${truncateText(r.description || r.title, 70)}`,
          )
          .join('\n')
      : truncateText(rawText || purpose, 400);
  const level0 =
    rawText.trim() !== ''
      ? rawText
      : `${purpose}\n\n` +
        doc.rules.map((r) => `[@req:${r.reqId}] ${r.title}\n${r.description}`).join('\n\n');

  return [level0, level1, level2, level3, level4];
}

/** Fallback deterministic 5-level folding for arbitrary plain text when no CapabilityDoc is parsed. */
export function foldPlainText(content: string): TextfoldLevels {
  const trimmed = content.trim();
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const firstLine = lines[0] ?? '';
  const level4 = truncateText(firstLine, 72);
  const level3 = truncateText(lines.slice(0, 2).join(' '), 120);
  const level2 = truncateText(lines.slice(0, 4).join('；'), 220);
  const level1 = truncateText(lines.slice(0, 10).join('\n'), 500);
  return [trimmed, level1, level2, level3, level4];
}
