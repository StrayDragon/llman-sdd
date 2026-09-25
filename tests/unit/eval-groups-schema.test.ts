import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildPiModelsJson,
  EXAMPLE_DOC,
  FILL_MARK,
  FILL_MODEL,
  fillSentinelIssues,
  harborModelName,
  issuesInEvalGroups,
  PI_API_DEFAULT,
  PI_PROVIDER_DEFAULT,
  PI_THINKING_DEFAULT,
  renderGroupsExampleYaml,
  renderPiComposeOverlay,
  rewriteUrlHostPort,
  resolvePiConfig,
  resolveWorktree,
} from '../../eval/groups-schema.ts';

const valid = {
  n_attempts: 3,
  model: 'openai/local-model',
  baseline: 'stable',
  groups: {
    stable: { worktree: '/wt/a' },
    experiment: { worktree: '/wt/b' },
  },
};

test('rejects zero groups', () => {
  expect(
    issuesInEvalGroups({
      n_attempts: 1,
      model: 'openai/x',
      groups: {},
    }),
  ).toContain('groups must contain at least 1 entry');
});

test('accepts a single group with empty worktree', () => {
  expect(
    issuesInEvalGroups({
      n_attempts: 1,
      model: 'deepseek-v4-flash-0731',
      baseline: 'stable',
      groups: { stable: { worktree: '' } },
    }),
  ).toEqual([]);
});

test('accepts omitted worktree as current repo later', () => {
  expect(
    issuesInEvalGroups({
      n_attempts: 1,
      model: 'x',
      groups: { stable: {} },
    }),
  ).toEqual([]);
});

test('rejects missing n_attempts', () => {
  expect(
    issuesInEvalGroups({
      model: 'openai/x',
      groups: { a: { worktree: '/a' }, b: { worktree: '/b' } },
    }),
  ).toContain('n_attempts must be a positive integer');
});

test('rejects missing model', () => {
  expect(
    issuesInEvalGroups({
      n_attempts: 3,
      groups: { a: { worktree: '/a' }, b: { worktree: '/b' } },
    }),
  ).toContain('model must be a non-empty string');
});

test('rejects baseline outside groups', () => {
  expect(
    issuesInEvalGroups({
      n_attempts: 3,
      model: 'openai/x',
      baseline: 'missing',
      groups: { a: { worktree: '/a' }, b: { worktree: '/b' } },
    }),
  ).toContain('baseline must be a key of groups');
});

test('accepts two named groups and baseline', () => {
  expect(issuesInEvalGroups(valid)).toEqual([]);
});

test('empty worktree resolves to repo root', () => {
  expect(resolveWorktree('', '/repo')).toBe('/repo');
  expect(resolveWorktree(null, '/repo')).toBe('/repo');
  expect(resolveWorktree('  /wt/a  ', '/repo')).toBe('/wt/a');
});

test('bare model ids get fusionsparks/ prefix for Harbor', () => {
  expect(harborModelName('deepseek-v4-flash-0731')).toBe(
    `${PI_PROVIDER_DEFAULT}/deepseek-v4-flash-0731`,
  );
  expect(harborModelName('openai/foo')).toBe('openai/foo');
});

test('Pi defaults to Responses API and thinking max', () => {
  const pi = resolvePiConfig({ model: 'deepseek-v4-flash-0731' });
  expect(pi.provider).toBe(PI_PROVIDER_DEFAULT);
  expect(pi.api).toBe(PI_API_DEFAULT);
  expect(pi.thinking).toBe('max');
  expect(pi.thinking).toBe(PI_THINKING_DEFAULT);
  expect(pi.harborModel).toBe('fusionsparks/deepseek-v4-flash-0731');
});

test('injected models.json keeps compat and 0731 thinkingLevelMap.max', () => {
  const json = buildPiModelsJson({
    model: 'deepseek-v4-flash-0731',
    openai_base_url: 'http://vllm.example:8000/v1',
  });
  expect(JSON.stringify(json)).not.toContain('harbor-endpoint');
  const provider = (json.providers as Record<string, Record<string, unknown>>).fusionsparks;
  expect(provider).toBeDefined();
  if (provider === undefined) throw new Error('missing fusionsparks');
  expect(provider.api).toBe('openai-responses');
  expect(provider.baseUrl).toBe('http://vllm.example:8000/v1');
  const models = provider.models as Array<Record<string, unknown>>;
  const model = models[0];
  expect(model).toBeDefined();
  if (model === undefined) throw new Error('missing model');
  expect(model.id).toBe('deepseek-v4-flash-0731');
  expect(model.reasoning).toBe(true);
  const thinkingMap = model.thinkingLevelMap as Record<string, string | null>;
  expect(thinkingMap.max).toBe('max');
  const compat = model.compat as { thinkingFormat?: string; chatTemplateKwargs?: unknown };
  expect(compat.thinkingFormat).toBe('chat-template');
  expect(JSON.stringify(compat.chatTemplateKwargs)).toContain('thinking.effort');
});

test('compose overlay sets thinking max and writable PI_CODING_AGENT_DIR', () => {
  const yaml = renderPiComposeOverlay(PI_THINKING_DEFAULT);
  expect(yaml).toContain('PI_THINKING: max');
  expect(yaml).toContain('PI_CODING_AGENT_DIR: /tmp/pi-config');
  expect(yaml).toContain('host.docker.internal:host-gateway');
  expect(yaml).toContain('harbor-docker-egress-control-sidecar');
});

test('rewriteUrlHostPort keeps path and sets host-gateway port', () => {
  expect(rewriteUrlHostPort('http://fusion.example:8888/v1', 'host.docker.internal', 18731)).toBe(
    'http://host.docker.internal:18731/v1',
  );
});

test('rejects invalid pi.thinking', () => {
  expect(
    issuesInEvalGroups({
      n_attempts: 1,
      model: 'x',
      pi: { thinking: 'turbo' },
      groups: { stable: {} },
    }),
  ).toContain('pi.thinking must be one of off, minimal, low, medium, high, xhigh, max');
});

test('FILL sentinels are not ready to run', () => {
  expect(fillSentinelIssues(EXAMPLE_DOC).some((i) => i.includes(FILL_MARK))).toBe(true);
  expect(FILL_MODEL.includes(FILL_MARK)).toBe(true);
});

test('committed example matches renderer SSOT', () => {
  const path = join(import.meta.dir, '../../eval/groups.yaml.example');
  expect(existsSync(path)).toBe(true);
  expect(readFileSync(path, 'utf8')).toBe(renderGroupsExampleYaml());
});

test('just qa recipe does not invoke harbor or Pi eval', () => {
  const justfile = readFileSync(join(import.meta.dir, '../../justfile'), 'utf8');
  const qa = justfile.split(/^qa:/m)[1]?.split(/^[a-z].*:/m)[0] ?? '';
  expect(qa.includes('harbor')).toBe(false);
  expect(qa.includes('eval/run')).toBe(false);
});

test('playbook step dirs match task.toml [[steps]].name', () => {
  const toml = readFileSync(join(import.meta.dir, '../../eval/tasks/playbook/task.toml'), 'utf8');
  const names = [...toml.matchAll(/^name = "(c[0-9]+-[^"]+)"/gm)].map((m) => m[1]);
  expect(names).toEqual(['c1-tip-integer-archive', 'c2-zero-amount-archive']);
  for (const name of names) {
    expect(
      existsSync(
        join(import.meta.dir, '../../eval/tasks/playbook/steps', name ?? '', 'instruction.md'),
      ),
    ).toBe(true);
  }
});
