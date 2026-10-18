/** Extract depends_on entries (r30): lenient policy over the shared reader. */
import { readDepsLenient } from '../../change/deps.ts';

export function parseDeps(proposal: string): string[] {
  return readDepsLenient(proposal);
}
