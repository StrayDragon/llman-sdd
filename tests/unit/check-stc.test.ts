import { expect, test } from 'bun:test';
// check-stc 门单测:基线读取、超限判定、缺键容错、stc status=1(errors>0)非失败。
// 真门本体 scripts/check-stc.ts 以子进程跑全仓模板;此处只测纯逻辑,抽出的判定函数从模块导入。

import { evaluate, parseStcJson, type BaselineDoc } from '../../scripts/check-stc-lib.ts';

const BASE: BaselineDoc = {
  note: 't',
  baseline: {
    'a.md': 3,
    'b.md': 0,
  },
};

test('errors within baseline passes and over baseline fails', () => {
  expect(evaluate('a.md', 3, BASE).ok).toBe(true);
  expect(evaluate('a.md', 2, BASE).ok).toBe(true);
  const over = evaluate('a.md', 4, BASE);
  expect(over.ok).toBe(false);
  expect(over.message).toContain('4 > 基线 3');
});

test('zero baseline requires zero errors', () => {
  expect(evaluate('b.md', 0, BASE).ok).toBe(true);
  expect(evaluate('b.md', 1, BASE).ok).toBe(false);
});

test('missing key fails with guidance', () => {
  const missing = evaluate('c.md', 0, BASE);
  expect(missing.ok).toBe(false);
  expect(missing.message).toContain('基线缺键');
});

test('stc status=1 with valid json is errors payload, not failure', () => {
  const parsed = parseStcJson(1, '{"errors":2,"warnings":0,"files":[]}');
  expect(parsed).not.toBeNull();
  expect(parsed?.errors).toBe(2);
});

test('stc crash without stdout is null', () => {
  expect(parseStcJson(2, null)).toBeNull();
  expect(parseStcJson(0, 'not-json')).toBeNull();
});
