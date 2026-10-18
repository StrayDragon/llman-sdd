import { describe, expect, test } from 'bun:test';

import {
  COMPLETION_BIN,
  COMPLETION_MARKER_END,
  COMPLETION_MARKER_START,
  collectFlags,
  completionBlock,
  isCompletionShell,
  renderCompletionScript,
  resolveBashRc,
  upsertCompletionBlock,
  type CompletionCommandSpec,
} from '@llman-sdd/core';

const tree: CompletionCommandSpec = {
  name: 'llman-sdd',
  flags: ['--help', '--version'],
  subcommands: [
    {
      name: 'change',
      flags: ['--directory', '--json'],
      subcommands: [
        { name: 'new', flags: ['--from'], subcommands: [] },
        { name: 'start', flags: ['--worktree'], subcommands: [] },
      ],
    },
    { name: 'validate', flags: ['--directory', '--check'], subcommands: [] },
    { name: 'review', flags: ['--capability'], subcommands: [] },
  ],
};

describe('renderCompletionScript (r110)', () => {
  test('every shell embeds bin name, top commands, and --directory', () => {
    for (const shell of ['bash', 'zsh', 'fish', 'powershell', 'elvish'] as const) {
      const script = renderCompletionScript(tree, shell);
      expect(script).toInclude(COMPLETION_BIN);
      expect(script).toInclude('change');
      expect(script).toInclude('validate');
      // fish 的长旗标惯用法是 -l directory(去 -- 前缀),语义等价
      expect(script).toInclude(shell === 'fish' ? '-l directory' : '--directory');
      expect(script.length).toBeGreaterThan(80);
    }
  });

  test('bash renders the complete directive and per-command flag case', () => {
    const s = renderCompletionScript(tree, 'bash');
    expect(s).toInclude('complete -F');
    expect(s).toInclude('change) local flags=');
  });

  test('fish emits per-command scoped flag lines', () => {
    const s = renderCompletionScript(tree, 'fish');
    expect(s).toInclude('__fish_seen_subcommand_from change');
    expect(s).toInclude('-l directory');
  });

  test('flag union dedupes across the tree and stays sorted', () => {
    expect(collectFlags(tree)).toEqual([
      '--capability',
      '--check',
      '--directory',
      '--from',
      '--help',
      '--json',
      '--version',
      '--worktree',
    ]);
  });

  test('marker block wraps snippet exactly', () => {
    const block = completionBlock('SNIPPET');
    expect(block.startsWith(COMPLETION_MARKER_START)).toBe(true);
    expect(block.endsWith(COMPLETION_MARKER_END)).toBe(true);
    expect(block).toInclude('SNIPPET');
  });
});

describe('isCompletionShell (r110 value domain)', () => {
  test('legal five accepted; junk rejected', () => {
    for (const s of ['bash', 'zsh', 'fish', 'powershell', 'elvish']) {
      expect(isCompletionShell(s)).toBe(true);
    }
    expect(isCompletionShell('nushell')).toBe(false);
    expect(isCompletionShell('')).toBe(false);
  });
});

describe('upsertCompletionBlock (r111 marker idempotency)', () => {
  const snippet = 'source <(llman-sdd self completion --shell bash)';

  test('append into empty and non-newline-terminated content', () => {
    const a = upsertCompletionBlock('', snippet);
    expect(a.replaced).toBe(false);
    expect(a.content).toInclude(COMPLETION_MARKER_START);
    expect(a.content).toInclude(snippet);
    expect(a.content.endsWith('\n')).toBe(true);
    const b = upsertCompletionBlock('export FOO=1', snippet);
    expect(b.replaced).toBe(false);
    expect(b.content.indexOf('export FOO=1')).toBe(0);
    expect(b.content.indexOf('\n' + COMPLETION_MARKER_START)).toBeGreaterThan(0);
  });

  test('existing block replaced in place; block count never grows', () => {
    const first = upsertCompletionBlock('keep\n', 'old snippet').content;
    const second = upsertCompletionBlock(first, snippet);
    expect(second.replaced).toBe(true);
    expect(second.content.split(COMPLETION_MARKER_START)).toHaveLength(2);
    expect(second.content).toInclude(snippet);
    expect(second.content).not.toInclude('old snippet');
    expect(second.content.indexOf('keep\n')).toBe(0);
    expect(second.content.split(COMPLETION_MARKER_END)).toHaveLength(2);
  });
});

describe('resolveBashRc (r111 fallback chain)', () => {
  test('bashrc preferred, then bash_profile, then profile, else bashrc', () => {
    expect(resolveBashRc('/h', (p) => p.endsWith('.bashrc'))).toBe('/h/.bashrc');
    expect(resolveBashRc('/h', (p) => p.endsWith('.bash_profile'))).toBe('/h/.bash_profile');
    expect(resolveBashRc('/h', (p) => p.endsWith('.profile'))).toBe('/h/.profile');
    expect(resolveBashRc('/h', () => false)).toBe('/h/.bashrc');
  });
});
