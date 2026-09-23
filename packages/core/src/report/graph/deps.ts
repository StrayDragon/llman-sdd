/** Extract depends_on entries (flow + block styles, r30). */
export function parseDeps(proposal: string): string[] {
  const fm = proposal.match(/^---\n([\s\S]*?)\n---/u);
  const deps: string[] = [];
  if (!fm?.[1]) return deps;
  let inDeps = false;
  for (const line of fm[1].split('\n')) {
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
