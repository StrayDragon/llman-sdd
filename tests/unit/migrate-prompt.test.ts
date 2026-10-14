import { describe, expect, test } from 'bun:test';

import {
  findMigration,
  isValidMigrationExpr,
  knownMigrationIds,
  migrationPrompt,
} from '@llman-sdd/core';

describe('migration registry (r100 project migrate prompt)', () => {
  test('0.7.5->0.8.0 registered with executable steps and checks', () => {
    const m = findMigration('0.7.5->0.8.0');
    expect(m).not.toBeNull();
    expect(m?.steps.length).toBeGreaterThan(0);
    expect(m?.checks.length).toBeGreaterThan(0);
    expect(m?.steps.join('\n')).toContain('strip-legacy-headers');
    expect(m?.steps.join('\n')).toContain('init --update');
  });

  test('unknown or malformed expr handling', () => {
    expect(findMigration('9.9.9->9.9.10')).toBeNull();
    expect(isValidMigrationExpr('0.7.5->0.8.0')).toBe(true);
    expect(isValidMigrationExpr('0.7->0.8')).toBe(false);
    expect(knownMigrationIds()).toContain('0.7.5->0.8.0');
  });

  test('playbook renders steps and checklist deterministically', () => {
    const m = findMigration('0.7.5->0.8.0');
    const a = migrationPrompt(m!);
    const b = migrationPrompt(m!);
    expect(a).toBe(b);
    expect(a).toContain('## Verification checklist');
    expect(a.match(/^- \[ \] /gm)?.length).toBe(m?.checks.length);
  });
});
