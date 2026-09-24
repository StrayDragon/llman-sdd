import { describe, expect, test } from 'bun:test';

import {
  parseDeps,
  readBinding,
  showChangeJson,
  validateChange,
  writeBinding,
  type ChangeFsIo,
  type ChangeFsIoLite,
  type GitLike,
} from '@llman-sdd/core';

import {
  extractFrontmatter,
  readNeedsSpecsChange,
  specsLanded,
} from '../../packages/core/src/change/frontmatter.ts';

/**
 * B2 characterization: pin the CURRENT observable behavior of the four
 * proposal-frontmatter extraction points (report/graph/deps.ts parseDeps,
 * report/show.ts needsSpecsChange, validation/changeCheck.ts depends_on /
 * blocks gates, change/frontmatter.ts splitFrontmatter) before they are
 * unified onto a single extractor in change/frontmatter.ts. Inputs cover the
 * canonical proposal shape plus pathological line-ending / unclosed-block /
 * trailing-text / embedded-delimiter / empty shapes; where the extraction
 * points legitimately differ, each point asserts its own outcome.
 */

const CHANGE_IO_FILES = (proposal: string): Record<string, string> => ({
  './llmanspec/changes/demo/proposal.md': proposal,
});

const changeFsIo = (proposal: string): ChangeFsIo => {
  const files = CHANGE_IO_FILES(proposal);
  return {
    exists: (p) => files[p] !== undefined,
    readText: (p) => {
      const v = files[p];
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    },
    listDir: () => [],
    isDirectory: () => false,
    mtimeMs: () => 0,
  };
};

const changeCheckIo = (proposal: string): ChangeFsIoLite => {
  const files = CHANGE_IO_FILES(proposal);
  return {
    exists: (p) => files[p] !== undefined,
    readText: (p) => {
      const v = files[p];
      if (v === undefined) throw new Error(`missing ${p}`);
      return v;
    },
    listDir: () => [],
    isDirectory: () => false,
  };
};

const noopGit: GitLike = { run: () => '', runOpt: () => null };

const CHANGE_CONFIG = { strict_defer: null, change_id_pattern: null };

const unknownDepErrors = (proposal: string): string[] =>
  validateChange(changeCheckIo(proposal), '.', 'demo', CHANGE_CONFIG, {})
    .issues.filter((i) => i.message.includes('references unknown change'))
    .map((i) => i.message);

const needsSpecsChangeOf = (proposal: string): boolean =>
  showChangeJson(
    { io: changeFsIo(proposal), git: noopGit, root: '.', specsDir: 'llmanspec/specs' },
    'demo',
  ).needsSpecsChange as boolean;

describe('T1: single splitter + readNeedsSpecsChange + specsLanded (r73/D2)', () => {
  test('EOF-closed block without trailing newline: extractFrontmatter and readBinding agree', () => {
    const proposal = '---\nbranch: sdd/x\nbase_branch: main\nbase_sha: abc\n---';
    expect(extractFrontmatter(proposal)).toBe('branch: sdd/x\nbase_branch: main\nbase_sha: abc');
    expect(readBinding(proposal)).toEqual({ branch: 'sdd/x', baseBranch: 'main', baseSha: 'abc' });
  });

  test('body text with needs_specs_change: false does not flip the frontmatter verdict', () => {
    const proposal = '---\ndepends_on: []\n---\n\nneeds_specs_change: false\n';
    expect(readNeedsSpecsChange(extractFrontmatter(proposal))).toBe(true);
  });

  test('specsLanded: docs/llmanspec/specs/x without an llmanspec/specs/ line is false', () => {
    const git: GitLike = {
      run: (): string => '',
      runOpt: (): string | null => 'docs/llmanspec/specs/x\nsrc/a.ts\n',
    };
    expect(specsLanded(git, { branch: 'sdd/x', baseBranch: 'main', baseSha: 'abc' })).toBe(false);
  });

  test('specsLanded: a real llmanspec/specs/ line is true', () => {
    const git: GitLike = {
      run: (): string => '',
      runOpt: (): string | null => 'src/a.ts\nllmanspec/specs/x.feature\n',
    };
    expect(specsLanded(git, { branch: 'sdd/x', baseBranch: 'main', baseSha: 'abc' })).toBe(true);
  });

  test('writeBinding round-trip closes the block with \\n---\\n', () => {
    const eofClosed = '---\nbranch: sdd/old\nbase_branch: main\nbase_sha: abc\n---';
    const written = writeBinding(eofClosed, {
      branch: 'sdd/new',
      baseBranch: 'main',
      baseSha: 'def',
    });
    expect(written.endsWith('\n---\n')).toBe(true);
    expect(readBinding(written)).toEqual({ branch: 'sdd/new', baseBranch: 'main', baseSha: 'def' });
  });
});

describe('B2 characterization: frontmatter extraction per consume point', () => {
  describe('consume point: parseDeps (report/graph/deps.ts regex)', () => {
    test('legal double --- block: deps parsed from the block', () => {
      expect(parseDeps('---\ndepends_on: [ghost]\n---\n\n## Why\nx\n')).toEqual(['ghost']);
    });

    test('CRLF line endings: block not extracted → no deps', () => {
      expect(parseDeps('---\r\ndepends_on: [ghost]\r\n---\r\nbody\r\n')).toEqual([]);
    });

    test('no closing ---: no deps', () => {
      expect(parseDeps('---\ndepends_on: [ghost]\n')).toEqual([]);
    });

    test('trailing text after close: only first block counts', () => {
      expect(parseDeps('---\ndepends_on: [ghost]\n---\n---\ndepends_on: [ghost2]\n')).toEqual([
        'ghost',
      ]);
    });

    test('--- line inside frontmatter: first close wins, later keys are body', () => {
      expect(parseDeps('---\ndesc: a\n---\ndepends_on: [ghost]\n---\nbody\n')).toEqual([]);
    });

    test('empty file: no deps', () => {
      expect(parseDeps('')).toEqual([]);
    });
  });

  describe('consume point: showChangeJson.needsSpecsChange (report/show.ts regex)', () => {
    test('legal block: explicit false honored', () => {
      expect(needsSpecsChangeOf('---\nneeds_specs_change: false\n---\n\n## Why\nx\n')).toBe(false);
    });

    test('legal block without the key: defaults true', () => {
      expect(needsSpecsChangeOf('---\ndepends_on: []\n---\n\n## Why\nx\n')).toBe(true);
    });

    test('CRLF line endings: block not extracted → defaults true', () => {
      expect(needsSpecsChangeOf('---\r\nneeds_specs_change: false\r\n---\r\nbody\r\n')).toBe(true);
    });

    test('no closing ---: defaults true', () => {
      expect(needsSpecsChangeOf('---\nneeds_specs_change: false\n')).toBe(true);
    });

    test('trailing text after close: first block wins', () => {
      expect(
        needsSpecsChangeOf('---\nneeds_specs_change: false\n---\n---\nneeds_specs_change: true\n'),
      ).toBe(false);
    });

    test('--- line inside frontmatter: key after first close is body → defaults true', () => {
      expect(needsSpecsChangeOf('---\ndesc: a\n---\nneeds_specs_change: false\n---\nbody\n')).toBe(
        true,
      );
    });

    test('empty file: defaults true', () => {
      expect(needsSpecsChangeOf('')).toBe(true);
    });
  });

  describe('consume point: validateChange depends_on gates (validation/changeCheck.ts regex)', () => {
    test('legal block: unknown dep flagged', () => {
      expect(unknownDepErrors('---\ndepends_on: [ghost]\n---\n\n## Why\nx\n')).toEqual([
        'proposal.md depends_on references unknown change: ghost',
      ]);
    });

    test('CRLF line endings: block not extracted → no dep errors', () => {
      expect(unknownDepErrors('---\r\ndepends_on: [ghost]\r\n---\r\nbody\r\n')).toEqual([]);
    });

    test('no closing ---: no dep errors', () => {
      expect(unknownDepErrors('---\ndepends_on: [ghost]\n')).toEqual([]);
    });

    test('trailing text after close: only first block counts', () => {
      expect(
        unknownDepErrors('---\ndepends_on: [ghost]\n---\n---\ndepends_on: [ghost2]\n'),
      ).toEqual(['proposal.md depends_on references unknown change: ghost']);
    });

    test('--- line inside frontmatter: first close wins, later keys are body', () => {
      expect(
        unknownDepErrors('---\ndepends_on: [ghost]\n---\ndepends_on: [ghost2]\n---\n'),
      ).toEqual(['proposal.md depends_on references unknown change: ghost']);
    });

    test('empty file: no dep errors', () => {
      expect(unknownDepErrors('')).toEqual([]);
    });
  });

  describe('consume point: readBinding/writeBinding (change/frontmatter.ts splitFrontmatter)', () => {
    test('legal block with binding keys: binding read', () => {
      expect(
        readBinding('---\nbranch: sdd/x\nbase_branch: main\nbase_sha: abc\n---\n\nbody\n'),
      ).toEqual({ branch: 'sdd/x', baseBranch: 'main', baseSha: 'abc' });
    });

    test('CRLF line endings: no binding', () => {
      expect(
        readBinding(
          '---\r\nbranch: sdd/x\r\nbase_branch: main\r\nbase_sha: abc\r\n---\r\nbody\r\n',
        ),
      ).toBeNull();
    });

    test('no closing ---: no binding', () => {
      expect(readBinding('---\nbranch: sdd/x\nbase_branch: main\nbase_sha: abc\n')).toBeNull();
    });

    test('trailing text after close: first block wins', () => {
      expect(
        readBinding(
          '---\nbranch: sdd/x\nbase_branch: main\nbase_sha: abc\n---\n---\nbranch: sdd/y\n',
        ),
      ).toEqual({ branch: 'sdd/x', baseBranch: 'main', baseSha: 'abc' });
    });

    test('--- line inside frontmatter: first close wins', () => {
      expect(
        readBinding(
          '---\nbranch: sdd/x\nbase_branch: main\nbase_sha: abc\n---\nbranch: sdd/y\n---\n',
        ),
      ).toEqual({ branch: 'sdd/x', baseBranch: 'main', baseSha: 'abc' });
    });

    test('empty file: no binding', () => {
      expect(readBinding('')).toBeNull();
    });

    test('writeBinding prepends a block when none is present (empty file input)', () => {
      expect(writeBinding('', { branch: 'sdd/x', baseBranch: 'main', baseSha: 'abc' })).toBe(
        '---\nbranch: sdd/x\nbase_branch: main\nbase_sha: abc\n---\n',
      );
    });
  });
});
