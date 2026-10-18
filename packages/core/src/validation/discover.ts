import { assignSpecIds } from '../spec/assignSpecIds.ts';
import { parseCapability } from '../spec/parser.ts';
import { type FsPort } from '../util/fsPort.ts';
/**
 * Spec discovery (validation capability): walk llmanspec/specs/** for
 * .feature files via injected IO — core stays filesystem-free.
 */
import type { SpecEntry } from './validate.ts';

export type DiscoveryIo = Pick<FsPort, 'exists' | 'isDirectory' | 'listDir' | 'readText'>;

export function discoverSpecs(specsDir: string, io: DiscoveryIo): SpecEntry[] {
  const normDir = specsDir.replace(/\\/g, '/').replace(/\/$/u, '');
  const entries = discoverFeatureFiles(normDir, io).map((path) => ({
    fileName: path,
    doc: parseCapability(io.readText(path), path),
  }));
  assignSpecIds(entries, normDir);
  return entries;
}

/**
 * T24 single .feature discovery: sorted depth-first walk, `/`-joined paths
 * under the backslash-normalized root. The freshness hash (context/tree) and
 * the specHelpers loader delegate here so ordering and path shape cannot drift
 * (spec-hash stability / index freshness depend on this exact order).
 */
export function discoverFeatureFiles(
  normDir: string,
  io: Pick<DiscoveryIo, 'exists' | 'isDirectory' | 'listDir'>,
): string[] {
  const walk = (dir: string): string[] => {
    if (!io.exists(dir) || !io.isDirectory(dir)) return [];
    const out: string[] = [];
    for (const name of io.listDir(dir).toSorted()) {
      const full = dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
      if (io.isDirectory(full)) out.push(...walk(full));
      else if (name.endsWith('.feature')) out.push(full);
    }
    return out;
  };
  return walk(normDir);
}
