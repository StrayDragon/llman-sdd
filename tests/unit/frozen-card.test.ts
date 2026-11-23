import { describe, expect, test } from 'bun:test';

import { parseDeps, unfenceFrozenCard } from '@llman-sdd/core';
import { parse as parseYaml } from 'yaml';

const FENCED = '---\ntitle: "t"\ndepends_on: [fix-a, fix-b]\n---\n';
const PLAIN = 'title: "t"\ndepends_on: [fix-a, fix-b]\n';

describe('unfenceFrozenCard (r121)', () => {
  test('fenced card loses both fences and stays equivalent for parseDeps', () => {
    const out = unfenceFrozenCard(FENCED);
    expect(out).toBe(PLAIN);
    expect(parseDeps(out as string)).toEqual(parseDeps(FENCED));
    // the whole point: generic single-document validators accept the result
    expect(() => parseYaml(out as string)).not.toThrow();
  });

  test('already fence-free card returns null (idempotent)', () => {
    expect(unfenceFrozenCard(PLAIN)).toBeNull();
    const once = unfenceFrozenCard(FENCED) as string;
    expect(unfenceFrozenCard(once)).toBeNull();
  });

  test('CRLF fences are recognized', () => {
    const crlf = '---\r\ntitle: "t"\r\ndepends_on: [a]\r\n---\r\n';
    const out = unfenceFrozenCard(crlf);
    expect(out).not.toBeNull();
    expect(parseDeps(out as string)).toEqual(['a']);
  });

  test('a scalar containing --- is never rewritten', () => {
    // first line is not a bare fence -> untouched
    const card = 'title: "a --- b"\ndepends_on: []\n';
    expect(unfenceFrozenCard(card)).toBeNull();
  });

  test('fences wrapping non-YAML or multi-document bodies are skipped', () => {
    const multi = '---\ntitle: "t"\n---\ntitle: "u"\n---\n';
    expect(unfenceFrozenCard(multi)).toBeNull();
    const broken = '---\ntitle: "t"\ndepends_on: [a\n---\n';
    expect(unfenceFrozenCard(broken)).toBeNull();
  });

  test('keys outside title/depends_on are refused', () => {
    const withFrozen = '---\ntitle: "t"\ndepends_on: []\nfrozen:\n  at: "x"\n---\n';
    expect(unfenceFrozenCard(withFrozen)).toBeNull();
  });

  test('scalar or non-array depends_on is refused (would break edge parsing)', () => {
    const scalarDeps = '---\ntitle: "t"\ndepends_on: oops\n---\n';
    expect(unfenceFrozenCard(scalarDeps)).toBeNull();
    const objectDeps = '---\ntitle: "t"\ndepends_on:\n  a: b\n---\n';
    expect(unfenceFrozenCard(objectDeps)).toBeNull();
    const nonStringTitle = '---\ntitle: 42\ndepends_on: []\n---\n';
    expect(unfenceFrozenCard(nonStringTitle)).toBeNull();
  });

  test('a fence line with trailing whitespace still counts as a fence', () => {
    const padded = '---\ntitle: "t"\ndepends_on: [a]\n---   \n';
    const out = unfenceFrozenCard(padded);
    expect(out).toBe('title: "t"\ndepends_on: [a]\n');
  });

  test('empty body between fences returns null', () => {
    expect(unfenceFrozenCard('---\n---\n')).toBeNull();
  });
});
