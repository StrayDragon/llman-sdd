import { expect, test } from 'bun:test';

import { formatNotFound, pickNotFoundCandidates } from '../../apps/cli/src/cli-shared.ts';

test('pickNotFoundCandidates: prefix before substring before edit-distance, lex on ties', () => {
  const ids = ['ab-b', 'ab-a', 'xab', 'cab', 'zz', 'cut'];
  expect(pickNotFoundCandidates('ab', ids)).toEqual(['ab-a', 'ab-b', 'cab', 'xab', 'zz']);
});

test('pickNotFoundCandidates: max 5 after lexicographic prefix', () => {
  const ids = ['p-e', 'p-d', 'p-c', 'p-b', 'p-a', 'p-f'];
  expect(pickNotFoundCandidates('p-', ids)).toEqual(['p-a', 'p-b', 'p-c', 'p-d', 'p-e']);
});

test('pickNotFoundCandidates: edit distance <=2, distance then lex, then leftover', () => {
  expect(pickNotFoundCandidates('cut', ['cat', 'cot', 'dog'])).toEqual(['cat', 'cot', 'dog']);
});

test('pickNotFoundCandidates: same input same output', () => {
  const ids = ['beta-draft', 'alpha-draft', 'gamma'];
  const a = pickNotFoundCandidates('al', ids);
  const b = pickNotFoundCandidates('al', ids);
  expect(a).toEqual(b);
  expect(a).toEqual(['alpha-draft', 'beta-draft', 'gamma']);
});

test('formatNotFound omits Available when empty', () => {
  expect(formatNotFound('change', 'nope', [])).toBe('change not found: nope');
  expect(formatNotFound('studio state', 'nope', ['alpha-draft', 'beta-draft'])).toBe(
    'studio state not found: nope. Available: alpha-draft, beta-draft',
  );
});
