/**
 * Pure domain parser, validator & lock-manifest engine for Human Theorems (validation r161).
 * Inspired by Lean `theorem`: few, high-leverage human-owned invariants with optional executable gates.
 * Strictly pure: zero node:*, zero process.*, zero wall-clock calls.
 */
import { z } from 'zod';

export const THEOREMS_DIR_REL = 'llmanspec/theorems';
export const THEOREMS_LOCK_FILE = '.theorems.lock.json';
export const THEOREMS_LOCK_REL = `${THEOREMS_DIR_REL}/${THEOREMS_LOCK_FILE}`;

export const theoremItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  file: z.string().min(1),
  owner: z.string().min(1),
  statement: z.string().min(1),
  rationale: z.string().optional(),
  gate: z.string().optional(),
  scope: z.string().optional(),
  tags: z.array(z.string()),
});
export type TheoremItem = z.infer<typeof theoremItemSchema>;

export const theoremLockManifestSchema = z.object({
  version: z.literal(1),
  sealedAt: z.string().min(1),
  files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
});
export type TheoremLockManifest = z.infer<typeof theoremLockManifestSchema>;

export interface ParsedTheoremFile {
  file: string;
  title: string;
  owner: string;
  theorems: TheoremItem[];
  issues: string[];
}

export interface TheoremSourceFile {
  file: string;
  content: string;
}

export interface TheoremValidationResult {
  ok: boolean;
  theorems: TheoremItem[];
  issues: string[];
}

export interface TheoremLockVerification {
  status: 'sealed' | 'unsealed' | 'tampered';
  issues: string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u;
const THEOREM_HEADING_RE = /^##\s+theorem:([a-z0-9][a-z0-9_-]*)(?:\s*[—–-]+\s*(.+))?$/iu;
const FIELD_BULLET_RE = /^-\s+\*\*(statement|rationale|gate|scope|tags)\*\*\s*[:：]\s*(.*)$/iu;

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function stripInlineBackticks(s: string): string {
  const t = s.trim();
  if (t.startsWith('`') && t.endsWith('`') && t.length >= 2) {
    return t.slice(1, -1).trim();
  }
  return t;
}

export function parseTheoremFile(fileName: string, content: string): ParsedTheoremFile {
  let body = content;
  let docTitle = fileName.replace(/\.md$/u, '');
  let owner = 'human';
  const issues: string[] = [];

  const fm = FRONTMATTER_RE.exec(content);
  if (fm) {
    body = content.slice(fm[0].length);
    for (const line of fm[1]!.split(/\r?\n/u)) {
      const m = /^([a-z_]+)\s*:\s*(.*)$/iu.exec(line.trim());
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      const val = stripQuotes(m[2]!);
      if (key === 'title' && val) docTitle = val;
      if (key === 'owner' && val) owner = val;
    }
  }

  const theorems: TheoremItem[] = [];
  let current: {
    id: string;
    title: string;
    statement: string[];
    rationale: string[];
    gate?: string;
    scope?: string;
    tags: string[];
    lastField?: 'statement' | 'rationale';
  } | null = null;

  const flush = (): void => {
    if (!current) return;
    const statement = current.statement.join(' ').trim();
    if (!statement) {
      issues.push(`${fileName}: theorem:${current.id} missing required statement`);
    } else {
      const rationale = current.rationale.join(' ').trim();
      theorems.push({
        id: current.id,
        title: current.title,
        file: fileName,
        owner,
        statement,
        ...(rationale ? { rationale } : {}),
        ...(current.gate ? { gate: current.gate } : {}),
        ...(current.scope ? { scope: current.scope } : {}),
        tags: current.tags,
      });
    }
    current = null;
  };

  for (const rawLine of body.split(/\r?\n/u)) {
    const line = rawLine.trim();
    const hm = THEOREM_HEADING_RE.exec(line);
    if (hm) {
      flush();
      const id = hm[1]!.trim();
      const title = (hm[2] ?? id).trim();
      current = { id, title, statement: [], rationale: [], tags: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('## ')) {
      flush();
      continue;
    }
    const bm = FIELD_BULLET_RE.exec(line);
    if (bm) {
      const field = bm[1]!.toLowerCase();
      const val = bm[2]!.trim();
      if (field === 'statement') {
        if (val) current.statement.push(val);
        current.lastField = 'statement';
      } else if (field === 'rationale') {
        if (val) current.rationale.push(val);
        current.lastField = 'rationale';
      } else if (field === 'gate') {
        current.gate = stripInlineBackticks(val);
        current.lastField = undefined;
      } else if (field === 'scope') {
        current.scope = stripInlineBackticks(val);
        current.lastField = undefined;
      } else if (field === 'tags') {
        current.tags = val
          .split(/[,，\s]+/u)
          .map((t) => t.trim())
          .filter(Boolean);
        current.lastField = undefined;
      }
      continue;
    }
    if (line && !line.startsWith('#') && current.lastField) {
      current[current.lastField].push(line);
    }
  }
  flush();

  if (theorems.length === 0 && issues.length === 0) {
    issues.push(`${fileName}: no \`## theorem:<id>\` declarations found`);
  }

  return { file: fileName, title: docTitle, owner, theorems, issues };
}

export function validateTheoremSet(files: readonly TheoremSourceFile[]): TheoremValidationResult {
  const theorems: TheoremItem[] = [];
  const issues: string[] = [];
  const seenIds = new Map<string, string>();

  const sorted = [...files].sort((a, b) => a.file.localeCompare(b.file));
  for (const src of sorted) {
    const parsed = parseTheoremFile(src.file, src.content);
    issues.push(...parsed.issues);
    for (const th of parsed.theorems) {
      const prev = seenIds.get(th.id);
      if (prev) {
        issues.push(`duplicate theorem id \`${th.id}\` in ${th.file} (already defined in ${prev})`);
      } else {
        seenIds.set(th.id, th.file);
        theorems.push(th);
      }
    }
  }

  return { ok: issues.length === 0, theorems, issues };
}

export function buildTheoremLockManifest(
  files: readonly TheoremSourceFile[],
  sha256Hex: (text: string) => string,
  sealedAt = '1970-01-01T00:00:00.000Z',
): TheoremLockManifest {
  const entries: Array<[string, string]> = [...files]
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((f) => [f.file, sha256Hex(f.content)]);
  return {
    version: 1,
    sealedAt,
    files: Object.fromEntries(entries),
  };
}

export function verifyTheoremLockManifest(
  files: readonly TheoremSourceFile[],
  manifest: TheoremLockManifest | null,
  sha256Hex: (text: string) => string,
): TheoremLockVerification {
  if (!manifest) {
    return {
      status: 'unsealed',
      issues:
        files.length > 0
          ? ['missing .theorems.lock.json (run `llman-sdd theorem lock` to seal)']
          : [],
    };
  }
  const issues: string[] = [];
  const byFile = new Map(files.map((f) => [f.file, f.content]));

  for (const [file, expectedHash] of Object.entries(manifest.files)) {
    const content = byFile.get(file);
    if (content === undefined) {
      issues.push(`sealed theorem file missing or deleted: ${file}`);
      continue;
    }
    const actual = sha256Hex(content);
    if (actual !== expectedHash) {
      issues.push(`theorem file modified without human re-seal: ${file}`);
    }
  }
  for (const file of byFile.keys()) {
    if (!(file in manifest.files)) {
      issues.push(`unsealed theorem file added without human lock: ${file}`);
    }
  }

  return {
    status: issues.length === 0 ? 'sealed' : 'tampered',
    issues,
  };
}
