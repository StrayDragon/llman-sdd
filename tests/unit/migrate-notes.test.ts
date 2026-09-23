import { describe, expect, test } from 'bun:test';

import { MIGRATE_KINDS, isMigrateKind, migrateNoteFor, migrateOverviewFor } from '@llman-sdd/core';

describe('project migrate collaboration notes (peripheral-commands r35: explain, never migrate)', () => {
  test('both kinds resolve in zh-Hans and en; locale prefix zh selects zh', () => {
    for (const kind of MIGRATE_KINDS) {
      expect(migrateNoteFor(kind, 'zh-Hans')).toContain('--kind');
      expect(migrateNoteFor(kind, 'zh-CN')).toBe(migrateNoteFor(kind, 'zh-Hans'));
      expect(migrateNoteFor(kind, 'en')).not.toBe(migrateNoteFor(kind, 'zh-Hans'));
      expect(migrateNoteFor(kind, 'en')).toContain('performs no migration');
    }
  });

  test('each note states the no-migration contract and the post-migration gate', () => {
    for (const locale of ['zh-Hans', 'en']) {
      const toon = migrateNoteFor('toon2features', locale) ?? '';
      const flatten = migrateNoteFor('specs-flatten', locale) ?? '';
      expect(toon).toContain('validate --specs --strict');
      expect(toon).toContain('spec.toon');
      expect(toon).toContain('@executable');
      expect(flatten).toContain('validate --specs');
      expect(flatten).toContain('git mv');
    }
  });

  test('unknown kind returns null (CLI maps to exit 1)', () => {
    expect(migrateNoteFor('toon2feature', 'en')).toBeNull();
    expect(migrateNoteFor('', 'en')).toBeNull();
    expect(isMigrateKind('specs-flatten')).toBe(true);
    expect(isMigrateKind('specs_flatten')).toBe(false);
  });

  test('bare-invocation overview names both kinds', () => {
    expect(migrateOverviewFor('zh-Hans')).toContain('--kind toon2features');
    expect(migrateOverviewFor('zh-Hans')).toContain('--kind specs-flatten');
    expect(migrateOverviewFor('en')).toContain('--kind toon2features | --kind specs-flatten');
  });
});
