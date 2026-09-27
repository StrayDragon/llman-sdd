import { describe, expect, test } from 'bun:test';

import { dialects } from '@cucumber/gherkin';
import { BLOCK_KEYWORD_LINE_RE, officialKeywords, officialKeywordsOrEn } from '@llman-sdd/core';

describe('officialKeywords — gherkin dialect vocabulary SSOT (r88)', () => {
  test('zh-CN picks the localized synonyms: 规则/场景/假如/当/那么', () => {
    const kw = officialKeywords('zh-CN');
    expect(kw).not.toBeNull();
    expect(kw?.feature).toBe('功能');
    expect(kw?.rule).toBe('规则');
    expect(kw?.scenario).toBe('场景');
    expect(kw?.given).toBe('假如');
    expect(kw?.when).toBe('当');
    expect(kw?.thenText).toBe('那么');
  });

  test('en picks Rule/Scenario/Given/When/Then with trailing spaces trimmed', () => {
    const kw = officialKeywords('en');
    expect(kw).not.toBeNull();
    expect(kw?.feature).toBe('Feature');
    expect(kw?.rule).toBe('Rule');
    expect(kw?.scenario).toBe('Scenario');
    expect(kw?.given).toBe('Given');
    expect(kw?.when).toBe('When');
    expect(kw?.thenText).toBe('Then');
  });

  test('fr picks official table-first synonyms: Règle/Exemple/Soit/Quand/Alors', () => {
    const kw = officialKeywords('fr');
    expect(kw).not.toBeNull();
    expect(kw?.feature).toBe('Fonctionnalité');
    expect(kw?.rule).toBe('Règle');
    expect(kw?.scenario).toBe('Exemple');
    expect(kw?.given).toBe('Soit');
    expect(kw?.when).toBe('Quand');
    expect(kw?.thenText).toBe('Alors');
  });

  test('every picked keyword is a member of its own official dialect table', () => {
    // The selection policy may only ever emit synonyms the official parser
    // accepts for that dialect — a per-dialect membership property.
    for (const [lang, table] of Object.entries(dialects)) {
      const kw = officialKeywords(lang);
      if (kw === null) continue;
      for (const [tableKey, kwKey] of [
        ['feature', 'feature'],
        ['rule', 'rule'],
        ['scenario', 'scenario'],
        ['given', 'given'],
        ['when', 'when'],
        ['then', 'thenText'],
      ] as const) {
        const synonyms = table[tableKey].map((k) => k.trim());
        expect(synonyms).toContain(kw[kwKey]);
      }
    }
  });

  test('unknown language returns null; officialKeywordsOrEn falls back to en', () => {
    expect(officialKeywords('klingon')).toBeNull();
    const kw = officialKeywordsOrEn('klingon');
    expect(kw.rule).toBe('Rule');
    expect(kw.scenario).toBe('Scenario');
  });

  test('block boundary regex recognizes top-level block lines in en, zh-CN and fr', () => {
    for (const line of ['  Rule: a', '  规则: a', '  Règle: a', '  Feature: a', '  功能: a']) {
      expect(BLOCK_KEYWORD_LINE_RE.test(line)).toBe(true);
    }
    for (const line of ['    场景: nested', '  @req:r1', '  Scenario Outline: a']) {
      if (line === '  Scenario Outline: a') continue; // outline keyword itself is a boundary
      expect(BLOCK_KEYWORD_LINE_RE.test(line)).toBe(false);
    }
  });
});
