import { encode } from '@toon-format/toon';

/**
 * Machine-readable render targets shared by report commands (add-render-layer).
 * Each command owns one canonical IR (exactly the payload its `--json` emits);
 * every machine format renders from that single object, so formats can never
 * drift the way hand-written per-command JSON did. `human` prose is
 * deliberately out of scope — it stays per-command.
 */
export type MachineFormat = 'json' | 'compact-json' | 'toon';

/**
 * Render `ir` in the requested format. The returned string carries no trailing
 * newline (callers `console.log` it, matching the pre-renderer byte layout).
 *
 * - `json`: 2-space pretty — byte-identical to the historical `--json` output.
 * - `compact-json`: true minified single line (normalizes the historical
 *   strip-newlines / indent-0 variants; same data, contract still "one line").
 * - `toon`: TOON v1 via the official encoder (comma delimiter default).
 */
export function renderMachine(ir: unknown, format: MachineFormat): string {
  switch (format) {
    case 'compact-json':
      return JSON.stringify(ir);
    case 'toon':
      return encode(ir);
    case 'json':
      return JSON.stringify(ir, null, 2);
  }
}
