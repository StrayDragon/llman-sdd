/** Extract depends_on entries (flow + block styles, r30). */
import { extractFrontmatter } from '../../change/frontmatter.ts';

/**
 * r54 dual-format card reading: a fence-free frozen card is a plain YAML doc
 * whose FIRST line opens with `title:`/`depends_on:` — feed the whole text to
 * the same depends_on scan. Proposal.md bodies never open with those keys, so
 * no misfire.
 */
function cardYamlSource(input: string): string | null {
  const firstLine = input.trimStart().split('\n')[0] ?? '';
  return /^(title|depends_on):/u.test(firstLine) ? input : null;
}

export function parseDeps(proposal: string): string[] {
  const fm = extractFrontmatter(proposal) ?? cardYamlSource(proposal);
  const deps: string[] = [];
  if (!fm) return deps;
  let inDeps = false;
  for (const line of fm.split('\n')) {
    const flow = line.match(/^depends_on:\s*\[([^\]]*)\]\s*$/u);
    if (flow) {
      for (const item of flow[1]?.split(',') ?? []) {
        const dep = item.trim().replaceAll(/^['"]|['"]$/gu, '');
        if (dep !== '' && !/^[0-9]+$/u.test(dep)) deps.push(dep);
      }
      inDeps = false;
      continue;
    }
    if (/^depends_on:\s*$/u.test(line)) {
      inDeps = true;
      continue;
    }
    if (inDeps) {
      const m = line.match(/^\s*-\s+(\S+)/u);
      if (m?.[1] && !/^[0-9]+$/u.test(m[1])) deps.push(m[1]);
      else if (line.trim() !== '') inDeps = false;
    }
  }
  return deps;
}
