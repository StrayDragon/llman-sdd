import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SDD_STATE_REL, readSddState, semverLt, writeSddState } from '@llman-sdd/core';

import { makeNodeIo } from '../helpers/nodeIo.ts';

describe('sdd-state (version-awareness)', () => {
  test('write then read round-trips the version', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-state-'));
    const io = makeNodeIo(root);
    writeSddState(io, '0.7.2');
    expect(readSddState(io)).toEqual({ cli_version: '0.7.2' });
    const raw = readFileSync(join(root, SDD_STATE_REL), 'utf8');
    expect(raw).toBe('{\n  "cli_version": "0.7.2"\n}\n');
  });

  test('read: null on missing file', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-state-'));
    expect(readSddState(makeNodeIo(root))).toBeNull();
  });

  test('read: null on corrupt json or wrong shape (silent-OK contract)', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-state-'));
    const io = makeNodeIo(root);
    io.mkdirp('llmanspec/.context');
    io.writeText(SDD_STATE_REL, 'not json{');
    expect(readSddState(io)).toBeNull();
    io.writeText(SDD_STATE_REL, '{"noversion": 1}');
    expect(readSddState(io)).toBeNull();
    io.writeText(SDD_STATE_REL, '{"cli_version": 42}');
    expect(readSddState(io)).toBeNull();
  });

  test('write overwrites a previous stamp (re-init updates the record)', () => {
    const root = mkdtempSync(join(tmpdir(), 'llman-state-'));
    const io = makeNodeIo(root);
    writeSddState(io, '0.7.0');
    writeSddState(io, '0.8.0');
    expect(readSddState(io)).toEqual({ cli_version: '0.8.0' });
  });
});

describe('semverLt (drift comparison)', () => {
  test('older than current is true in both directions check', () => {
    expect(semverLt('0.7.0', '0.7.2')).toBe(true);
    expect(semverLt('0.7.2', '0.7.0')).toBe(false);
    expect(semverLt('0.7.2', '0.7.2')).toBe(false);
  });

  test('major/minor boundaries', () => {
    expect(semverLt('0.6.9', '0.7.0')).toBe(true);
    expect(semverLt('1.0.0', '0.9.9')).toBe(false);
    expect(semverLt('0.7', '0.7.1')).toBe(true);
  });

  test('non-numeric segments compare as zero', () => {
    expect(semverLt('0.7.2+dirty.5', '0.7.3')).toBe(true);
    expect(semverLt('abc', '0.0.1')).toBe(true);
  });
});
