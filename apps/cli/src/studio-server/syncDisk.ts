/**
 * Disk-backed Studio sync preview (CLI + Hub). Reads .feature files and re-extracts
 * THEIRS IR; never writes llmanspec/specs/. Hashing and fs stay in this adapter.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildDocSyncItems,
  buildSyncItems,
  extractStudioMachines,
  parseCapability,
  type SpecEntry,
  type StudioMachineIR,
  type StudioStateDoc,
  type SyncItem,
} from '@llman-sdd/core';

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function readWorkspaceFile(instanceRoot: string, relPath: string): string | null {
  const abs = resolve(instanceRoot, relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

export function extractTheirsMachine(
  instanceRoot: string,
  sourceFile: string,
  machineKey: string,
): StudioMachineIR | null {
  const text = readWorkspaceFile(instanceRoot, sourceFile);
  if (text === null) return null;
  const entry: SpecEntry = {
    fileName: sourceFile,
    specId: sourceFile.replace(/^.*\//u, '').replace(/\.feature$/u, ''),
    doc: parseCapability(text, sourceFile),
  };
  const hit = extractStudioMachines([entry]).find(
    (m) => (m.machine.machineKey ?? m.draft.current?.machineKey) === machineKey,
  );
  return hit?.machine ?? null;
}

export interface DiskSyncPreview {
  stale: boolean;
  staleFiles: string[];
  items: SyncItem[];
  diskHashes: Record<string, string>;
}

export function collectDiskSyncPreview(instanceRoot: string, doc: StudioStateDoc): DiskSyncPreview {
  const staleFiles: string[] = [];
  const diskHashes: Record<string, string> = {};
  const items: SyncItem[] = [];

  const consider = (file: string, text: string | null): void => {
    if (text === null) return;
    const hash = sha256Hex(text);
    diskHashes[file] = hash;
    const expected = doc.baseHashes?.[file];
    if (expected !== undefined && expected !== hash && !staleFiles.includes(file)) {
      staleFiles.push(file);
    }
  };

  for (const draft of Object.values(doc.machines)) {
    const text = readWorkspaceFile(instanceRoot, draft.sourceFile);
    consider(draft.sourceFile, text);
    if (text === null) continue;
    const expected = doc.baseHashes?.[draft.sourceFile];
    const hash = sha256Hex(text);
    if (expected !== undefined && expected !== hash) {
      const machineKey = draft.current?.machineKey ?? draft.baseline?.machineKey ?? '';
      const theirs = extractTheirsMachine(instanceRoot, draft.sourceFile, machineKey);
      items.push(...buildSyncItems(draft, theirs));
    }
  }

  for (const [capId, docDraft] of Object.entries(doc.docDrafts ?? {})) {
    void capId;
    const text = readWorkspaceFile(instanceRoot, docDraft.sourceFile);
    consider(docDraft.sourceFile, text);
    if (text === null) continue;
    const expected = doc.baseHashes?.[docDraft.sourceFile] ?? docDraft.baseHash;
    if (expected !== sha256Hex(text)) {
      items.push(...buildDocSyncItems(docDraft.sourceFile, docDraft.currentText, text));
    }
  }

  return { stale: staleFiles.length > 0, staleFiles, items, diskHashes };
}
