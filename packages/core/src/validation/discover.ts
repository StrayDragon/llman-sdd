import { parseCapability } from '../spec/parser.ts';
/**
 * Spec discovery (validation capability): walk llmanspec/specs/** for
 * .feature files via injected IO — core stays filesystem-free.
 */
import type { SpecEntry } from './validate.ts';

export interface DiscoveryIo {
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  listDir(path: string): string[];
  readText(path: string): string;
}

export function discoverSpecs(specsDir: string, io: DiscoveryIo): SpecEntry[] {
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
  return walk(specsDir).map((path) => ({
    fileName: path,
    doc: parseCapability(io.readText(path), path),
  }));
}
