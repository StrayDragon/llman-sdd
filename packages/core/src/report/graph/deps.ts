/** Extract depends_on entries (flow + block styles, r30). */
import { extractFrontmatter } from '../../change/frontmatter.ts';

export function parseDeps(proposal: string): string[] {
  const fm = extractFrontmatter(proposal);
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
