/**
 * Legacy governance-header strip (drop-review-stamp-and-scope): removes
 * `# scope:` / `# reviewed-through:` / `# capability:` comment lines anywhere in
 * a .feature — inert since the header contract is `# language:` + `# purpose:`.
 * Pure: source in, result out; idempotent by construction
 * (a stripped source yields zero removals on the second pass).
 */
export function stripLegacyHeaderLines(source: string): { content: string; removed: number } {
  const lines = source.split('\n');
  const kept = lines.filter((line) => !/^#\s*(scope|reviewed-through|capability):/u.test(line));
  return { content: kept.join('\n'), removed: lines.length - kept.length };
}
