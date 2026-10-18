import { describe, expect, test } from 'bun:test';

import {
  MIGRATIONS,
  compareVersions,
  isValidVersion,
  knownMigrationVersions,
  migrationOverviewLines,
  migrationPrompt,
  parseVersionExpr,
  resolveMigrations,
} from '@llman-sdd/core';

describe('per-version migration registry (r100 project migrate prompt)', () => {
  test('registry is keyed by release version with executable items', () => {
    expect(knownMigrationVersions()).toEqual(['0.8.0', '0.9.0', '0.10.0']);
    for (const doc of MIGRATIONS) {
      expect(isValidVersion(doc.version)).toBe(true);
      for (const item of doc.items) {
        expect(item.steps.length).toBeGreaterThan(0);
        expect(item.checks.length).toBeGreaterThan(0);
      }
    }
  });

  test('range resolution is (from, to] with numeric ordering', () => {
    expect(resolveMigrations('0.7.5', '0.9.0').map((d) => d.version)).toEqual(['0.8.0', '0.9.0']);
    // left-open: from itself is excluded
    expect(resolveMigrations('0.8.0', '0.9.0').map((d) => d.version)).toEqual(['0.9.0']);
    // the exact range a 0.8.2 upgrader would pass
    expect(resolveMigrations('0.8.2', '0.9.0').map((d) => d.version)).toEqual(['0.9.0']);
    // right-inclusive: to itself is included
    expect(resolveMigrations('0.7.5', '0.8.0').map((d) => d.version)).toEqual(['0.8.0']);
    // 0.10.0 is reachable from 0.9.0 only (numeric ordering, left-open)
    expect(resolveMigrations('0.9.0', '0.10.0').map((d) => d.version)).toEqual(['0.10.0']);
    expect(resolveMigrations('0.9.0', '0.9.9')).toEqual([]);
    // empty range is legal, not an error
    expect(resolveMigrations('0.8.0', '0.8.2')).toEqual([]);
    // numeric, not lexicographic
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('0.8.2', '0.8.10')).toBeLessThan(0);
    expect(compareVersions('0.9.0', '0.9.0')).toBe(0);
  });

  test('version format validation', () => {
    expect(isValidVersion('0.9.0')).toBe(true);
    expect(isValidVersion('0.9')).toBe(false);
    expect(isValidVersion('v0.9.0')).toBe(false);
    expect(isValidVersion('0.9.0-rc1')).toBe(false);
  });

  test('deprecated version-expr parsing', () => {
    expect(parseVersionExpr('0.7.5->0.8.0')).toEqual({ from: '0.7.5', to: '0.8.0' });
    expect(parseVersionExpr('0.7.5-0.8.0')).toBeNull();
    expect(parseVersionExpr('0.7->0.8')).toBeNull();
  });

  test('playbook aggregates versions with headers and dividers, deterministically', () => {
    const a = migrationPrompt('0.7.5', '0.9.0');
    const b = migrationPrompt('0.7.5', '0.9.0');
    expect(a).toBe(b);
    expect(a).toContain('# Migration playbook: 0.7.5 -> 0.9.0');
    expect(a.indexOf('## 0.8.0')).toBeLessThan(a.indexOf('## 0.9.0'));
    expect(a.match(/^---$/gm)?.length).toBe(1); // divider between the two versions
    // counts must track the rendered RANGE, not the whole registry (T16 added 0.10.0)
    const range = resolveMigrations('0.7.5', '0.9.0');
    expect(a.match(/^### /gm)?.length).toBe(range.reduce((n, d) => n + d.items.length, 0));
    expect(a.match(/^- \[ \] /gm)?.length).toBe(
      range.reduce((n, d) => n + d.items.reduce((k, i) => k + i.checks.length, 0), 0),
    );
    for (const doc of range) for (const item of doc.items) expect(a).toContain(item.title);
  });

  test('empty range renders a friendly notice, not an error', () => {
    const out = migrationPrompt('0.8.0', '0.8.2');
    expect(out).toContain('No documented migrations for 0.8.0 -> 0.8.2.');
    expect(out).not.toContain('## ');
  });

  test('overview lists known versions with the new flags', () => {
    const lines = migrationOverviewLines().join('\n');
    expect(lines).toContain('- 0.8.0');
    expect(lines).toContain('- 0.9.0');
    expect(lines).toContain('--from-version <from> --to-version <to>');
    expect(lines).not.toContain('--version-expr');
  });
});
