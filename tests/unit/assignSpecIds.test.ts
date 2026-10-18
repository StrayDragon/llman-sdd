import { describe, expect, test } from 'bun:test';

import {
  assignSpecIds,
  featureRelPath,
  parseCapability,
  preferredSpecIdFromRel,
  specIdOf,
  type SpecEntry,
} from '@llman-sdd/core';

const ROOT = 'llmanspec/specs';

const entry = (rel: string, feature: string): SpecEntry => {
  const src = `# language: zh-CN\n# purpose: p\n\n功能: ${feature}\n\n  @req:r1\n  规则: r\n    d\n`;
  return { fileName: `${ROOT}/${rel}`, doc: parseCapability(src, rel) };
};

describe('preferredSpecIdFromRel', () => {
  test('flat file uses stem', () => {
    expect(preferredSpecIdFromRel('cli.feature')).toBe('cli');
  });

  test('directory main file collapses when d===stem', () => {
    expect(preferredSpecIdFromRel('auth/auth.feature')).toBe('auth');
  });

  test('non-matching pair keeps path id', () => {
    expect(preferredSpecIdFromRel('cap/extra.feature')).toBe('cap/extra');
  });
});

describe('assignSpecIds', () => {
  test('collision disambiguates to relative path ids', () => {
    const entries = [entry('cli.feature', 'cli'), entry('legacy/cli.feature', 'legacy/cli')];
    assignSpecIds(entries, ROOT);
    expect(specIdOf(entries[0]!)).toBe('cli');
    expect(specIdOf(entries[1]!)).toBe('legacy/cli');
  });

  test('featureRelPath strips specs root prefix', () => {
    expect(featureRelPath(`${ROOT}/a/b.feature`, ROOT)).toBe('a/b.feature');
  });

  test('duplicate relative paths yield duplicate assigned spec ids', () => {
    const entries = [entry('dup.feature', 'dup'), entry('dup.feature', 'dup')];
    const duplicateIds = assignSpecIds(entries, ROOT);
    expect(duplicateIds).toEqual(new Set(['dup']));
    expect(specIdOf(entries[0]!)).toBe('dup');
    expect(specIdOf(entries[1]!)).toBe('dup');
  });

  // fix-review-sweep-path: spec id 推导路径形态无关——绝对文件名 + 缺省相对
  // specsDir(review sweep 的真实调用形态)不得退化出全路径 id。
  test('absolute file names with relative specsDir derive basename-relative ids', () => {
    const abs = `/tmp/repo-under-test/${ROOT}`;
    expect(featureRelPath(`${abs}/cli.feature`, ROOT)).toBe('cli.feature');
    const entries: SpecEntry[] = [
      {
        fileName: `${abs}/change-lifecycle.feature`,
        doc: parseCapability(
          '# language: zh-CN\n# purpose: p\n\n功能: change-lifecycle\n',
          'change-lifecycle.feature',
        ),
      },
    ];
    assignSpecIds(entries, ROOT);
    expect(specIdOf(entries[0]!)).toBe('change-lifecycle');
  });

  test('nested host directories anchor on the last occurrence of specsDir', () => {
    // 双重宿主取最深:…/specs/nested/specs/x.feature → x.feature
    expect(featureRelPath(`/tmp/repo/${ROOT}/nested/${ROOT}/x.feature`, ROOT)).toBe('x.feature');
    expect(featureRelPath(`/tmp/repo/${ROOT}/cap/extra.feature`, ROOT)).toBe('cap/extra.feature');
  });

  test('no specsDir hit keeps the input untouched (legacy behavior)', () => {
    expect(featureRelPath('/elsewhere/a.feature', ROOT)).toBe('/elsewhere/a.feature');
  });
});
