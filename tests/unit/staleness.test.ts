import { describe, expect, test } from 'bun:test';

import { evaluateStaleness, type GitLike } from '@llman-sdd/core';

/** Minimal GitLike stub: `diff --name-only base...HEAD` drives the STALE path. */
function gitStub(diffOutput: string, specRel: string): GitLike {
  return {
    runOpt: (args: string[]): string | null => {
      const joined = args.join(' ');
      if (joined.includes('rev-parse')) return 'aabbcc';
      if (joined.includes('merge-base')) return 'aabbcc';
      if (joined.includes('diff --name-only')) return diffOutput;
      if (joined.includes('status --porcelain')) return '';
      if (joined.includes('log')) return '';
      // defaultBranchName probe
      if (joined.includes('show-ref')) return 'refs/heads/main';
      return null;
    },
    run: (_args: string[]): string => '',
  };
}

function call(
  git: GitLike,
  overrides: Partial<Parameters<typeof evaluateStaleness>[0]> = {},
): ReturnType<typeof evaluateStaleness> {
  return evaluateStaleness({
    git,
    root: '/repo',
    specRel: 'llmanspec/specs/auth.feature',
    scope: ['apps/cli/src/'],
    baseRefEnv: 'main',
    ...overrides,
  });
}

describe('staleness STALE message (B25 semantics)', () => {
  test('scope code changed on branch without spec update → STALE with new message', () => {
    const res = call(gitStub('apps/cli/src/main.ts\n', ''));
    expect(res.info.status).toBe('STALE');
    expect(res.info.touchedPaths).toContain('apps/cli/src/main.ts');
    const stale = res.issues.find((i) => i.level === 'WARNING');
    expect(stale).toBeDefined();
    // 新文案语义:本分支改了 scope 内代码而 spec 未更新;不再指向基分支
    expect(stale?.message).toContain("Code in this spec's scope changed on this branch");
    expect(stale?.message).toContain('spec was not updated');
  });

  test('spec updated alongside scope change → not STALE', () => {
    const res = call(gitStub('apps/cli/src/main.ts\nllmanspec/specs/auth.feature\n', ''));
    expect(res.info.specUpdated).toBe(true);
    expect(res.info.status).not.toBe('STALE');
  });
});
