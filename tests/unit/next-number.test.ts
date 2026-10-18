import { describe, expect, test } from 'bun:test';

import { maxUsedNumber, nextNumber } from '@llman-sdd/core';

// unify-numeric-id-allocation: 分配器原语契约——处处 max+1,空集 1,
// 单趟折叠(禁 spread),非规范化输入不致命,零持久化(纯函数)。
describe('nextNumber allocator primitive', () => {
  test('empty set yields 1', () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber(new Set<number>())).toBe(1);
  });

  test('unordered, duplicated, gapped sets yield max+1 (never smallest-free)', () => {
    expect(nextNumber([5, 1])).toBe(6);
    expect(nextNumber([1, 5, 1])).toBe(6);
    expect(nextNumber([3, 1, 4, 1, 5, 9, 2, 6])).toBe(10);
    expect(nextNumber([42])).toBe(43);
  });

  test('non-finite noise never wins the fold', () => {
    expect(nextNumber([Number.NaN, 7])).toBe(8);
    expect(nextNumber([Number.POSITIVE_INFINITY])).toBe(1);
    expect(nextNumber([Number.NaN])).toBe(1);
    expect(maxUsedNumber([Number.NaN, 7])).toBe(7);
    expect(maxUsedNumber([])).toBeNull();
  });

  test('maxUsedNumber mirrors the fold used for distribution', () => {
    expect(maxUsedNumber([2, 8, 3])).toBe(8);
    expect(maxUsedNumber(new Set([1, 2]))).toBe(2);
  });
});
