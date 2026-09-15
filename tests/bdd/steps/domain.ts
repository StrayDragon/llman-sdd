import { spawnSync } from 'node:child_process';
// Domain step definitions: drive the real @llman-sdd/core APIs so the
// @executable scenarios in llmanspec/specs/*.feature double as acceptance
// tests for the config / spec-parsing / validation layers.
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildReqRegistry,
  discoverSpecs,
  runInit,
  loadConfig,
  parseCapability,
  validateAllSpecs,
  type CapabilityDoc,
  type DiscoveryIo,
} from '@llman-sdd/core';

import { bdd } from '../runner.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');
const runCmd = (cmd: string, args: string[]): string => {
  const proc = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return proc.stdout ?? '';
};

interface ParseResult {
  doc: CapabilityDoc;
}

interface RegistryResult {
  duplicates: { reqId: string; files: string[] }[];
}

const SAMPLE_FEATURE = `# language: zh-CN
# capability: 样例能力
# purpose: 验证中文关键字解析
# scope: x/

功能: 样例能力

  @req:r9 @human
  场景: 规则样例
    - 系统 MUST 提供样例能力
`;

bdd.given('一个 config 内容 extra_skills 含 "{value}"', (ctx, value) => {
  ctx.fixtures['config'] = { 源文本: `schema: spec-driven\nextra_skills:\n  - ${value}\n` };
  return ctx.fixtures['config'] as Record<string, unknown>;
});

bdd.when('加载该 config', (ctx) => {
  const source = String(ctx.fixtures['config']?.['源文本'] ?? '');
  try {
    loadConfig(source);
    ctx.fixtures['加载结果'] = { error: null };
  } catch (err) {
    ctx.fixtures['加载结果'] = { error: (err as Error).message };
  }
});

bdd.thenStep('报错信息包含 "{text}"', (ctx, text) => {
  const message = String(ctx.fixtures['加载结果']?.['error'] ?? '');
  if (!message) throw new Error('no error was captured by 当 加载该 config');
  if (!message.includes(text))
    throw new Error(`error message does not contain "${text}":\n${message}`);
});

bdd.thenStep('报错条数至多 {count:d}', (ctx, count) => {
  const message = String(ctx.fixtures['加载结果']?.['error'] ?? '');
  const lines = message.split('\n').filter((l) => l.startsWith('- '));
  if (lines.length > count)
    throw new Error(`expected at most ${count} issue lines, got ${lines.length}`);
});

bdd.given('一个使用中文关键字的 feature 内容', (ctx) => {
  ctx.fixtures['feature'] = { 源文本: SAMPLE_FEATURE };
  return ctx.fixtures['feature'] as Record<string, unknown>;
});

bdd.when('解析该 feature', (ctx) => {
  const source = String(ctx.fixtures['feature']?.['源文本'] ?? '');
  ctx.fixtures['解析结果'] = {
    doc: parseCapability(source, 'inline.feature'),
  } satisfies ParseResult as unknown as Record<string, unknown>;
});

bdd.thenStep('IR 中规则场景分类为 {classification}', (ctx, classification) => {
  const doc = (ctx.fixtures['解析结果'] as unknown as ParseResult | undefined)?.doc;
  const rule = doc?.scenarios.find((s) => s.classification === 'human');
  if (!rule) throw new Error('no human-classified scenario in IR');
  if (classification !== 'human')
    throw new Error(`unexpected classification arg: ${classification}`);
});

bdd.thenStep('req 链接为 {reqId}', (ctx, reqId) => {
  const doc = (ctx.fixtures['解析结果'] as unknown as ParseResult | undefined)?.doc;
  const ids = doc?.scenarios.flatMap((s) => s.reqIds) ?? [];
  if (!ids.includes(reqId)) throw new Error(`expected req link ${reqId}, got [${ids.join(', ')}]`);
});

bdd.given('两个 spec 文件都含 @req:{reqId} 标签', (ctx, reqId) => {
  const make = (capability: string): string => `# language: zh-CN
# capability: ${capability}
# purpose: 验证重复
# scope: x/

功能: ${capability}

  @req:${reqId} @human
  场景: 规则
    - 系统 MUST 提供能力
`;
  ctx.fixtures['重复样本'] = {
    docs: [
      { fileName: 'alpha.feature', doc: parseCapability(make('alpha'), 'alpha.feature') },
      { fileName: 'beta.feature', doc: parseCapability(make('beta'), 'beta.feature') },
    ],
  };
});

bdd.when('构建全局注册表', (ctx) => {
  const docs =
    (ctx.fixtures['重复样本'] as unknown as { docs: { fileName: string; doc: CapabilityDoc }[] })
      ?.docs ?? [];
  const reg = buildReqRegistry(docs);
  ctx.fixtures['注册表'] = {
    duplicates: reg.duplicates,
  } satisfies RegistryResult as unknown as Record<string, unknown>;
});

bdd.thenStep('报告包含重复对 {reqId}', (ctx, reqId) => {
  const reg = ctx.fixtures['注册表'] as unknown as RegistryResult | undefined;
  if (!reg?.duplicates.some((d) => d.reqId === reqId)) {
    throw new Error(`expected duplicate pair for ${reqId}, got ${JSON.stringify(reg?.duplicates)}`);
  }
});

// ---------------------------------------------------------------------------
// validation capability — seeded-defect specs directory
// ---------------------------------------------------------------------------

interface SpecsDirFixture {
  io: DiscoveryIo;
  specsDir: string;
}

interface ValidateResult {
  failed: boolean;
  lines: string[];
}

bdd.given('一个含互斥 tag 与重复 req_id 缺陷的 specs 目录', (ctx) => {
  const files: Record<string, string> = {
    'llmanspec/specs/mutual.feature': `# language: zh-CN\n# capability: mutual\n# purpose: p\n# scope: llmanspec/\n\n功能: mutual\n\n  @req:r11 @human @executable\n  场景: 互斥\n    - 系统 MUST x\n`,
    'llmanspec/specs/dupa.feature': `# language: zh-CN\n# capability: dupa\n# purpose: p\n# scope: llmanspec/\n\n功能: dupa\n\n  @req:r20 @human\n  场景: ok\n    - 系统 MUST x\n`,
    'llmanspec/specs/dupb.feature': `# language: zh-CN\n# capability: dupb\n# purpose: p\n# scope: llmanspec/\n\n功能: dupb\n\n  @req:r20 @human\n  场景: ok\n    - 系统 MUST x\n`,
  };
  const io: DiscoveryIo = {
    exists: (p) => p.startsWith('llmanspec/'),
    isDirectory: (p) => p === 'llmanspec/' || p === 'llmanspec/specs' || p === 'llmanspec/specs/',
    listDir: (p) => {
      const names = Object.keys(files).map((f) => f.slice('llmanspec/specs/'.length));
      return p === 'llmanspec/specs' || p === 'llmanspec/specs/' ? names : [];
    },
    readText: (p) => files[p] ?? '',
  };
  ctx.fixtures['缺陷目录'] = { io, specsDir: 'llmanspec/specs' };
});

bdd.when('运行 specs 校验', (ctx) => {
  const fixture = ctx.fixtures['缺陷目录'] as unknown as SpecsDirFixture | undefined;
  if (!fixture) throw new Error('no specs-dir fixture — did the 假如 step run?');
  const entries = discoverSpecs(fixture.specsDir, fixture.io);
  const report = validateAllSpecs(entries, fixture.io);
  ctx.fixtures['校验结果'] = { failed: report.failed, lines: report.lines };
});

bdd.thenStep('FAIL 集合包含 spec 条目', (ctx) => {
  const result = ctx.fixtures['校验结果'] as unknown as ValidateResult | undefined;
  const failLines = result?.lines.filter((l) => l.startsWith('FAIL spec/')) ?? [];
  if (failLines.length === 0) {
    throw new Error(`no FAIL spec entries in:\n${result?.lines.join('\n')}`);
  }
});

bdd.thenStep('退出码非零', (ctx) => {
  const result = ctx.fixtures['校验结果'] as unknown as ValidateResult | undefined;
  if (!result?.failed) throw new Error('expected validation to fail');
});

// ---------------------------------------------------------------------------
// change-lifecycle capability — real temp repos driven through the CLI
// ---------------------------------------------------------------------------

interface CliResult {
  exitCode: number;
  stdout: string;
}

interface TempRepo {
  root: string;
  run: (cmd: string, args: string[]) => { code: number; stdout: string };
}

function makeTempRepo(): TempRepo {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-'));
  const gitRun = (args: string[]): { code: number; stdout: string } => {
    const proc = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, stdout: proc.stdout ?? '' };
  };
  gitRun(['init', '-q', '-b', 'main']);
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  writeFileSync(
    join(root, 'llmanspec', 'specs', 'sample.feature'),
    '# language: zh-CN\n# capability: sample\n# purpose: p\n# scope: llmanspec/\n\n功能: sample\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n',
  );
  gitRun(['add', '-A']);
  gitRun(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return {
    root,
    run: (cmd, args) => {
      const proc = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
      return { code: proc.status ?? 1, stdout: proc.stdout ?? '' };
    },
  };
}

bdd.given('一个已提交的临时 git 仓库含 change "{id}" 的 proposal', (ctx, id) => {
  const repo = makeTempRepo();
  const proposalDir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(proposalDir, { recursive: true });
  writeFileSync(join(proposalDir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft']);
  ctx.fixtures['仓库'] = { root: repo.root, repo } as unknown as Record<string, unknown>;
  ctx.fixtures['change'] = { id };
  void CLI;
});

bdd.when('对其运行 change start', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as unknown as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as unknown as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['start结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
  } satisfies CliResult as unknown as Record<string, unknown>;
});

bdd.thenStep('分支 {branch} 被创建且被检出', (ctx, branch) => {
  const repo = (ctx.fixtures['仓库'] as unknown as { repo: TempRepo }).repo;
  const current = repo.run('git', ['branch', '--show-current']).stdout.trim();
  if (current !== branch) throw new Error(`expected branch ${branch}, got ${current}`);
});

bdd.thenStep('frontmatter 含 branch 与 base_branch', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as unknown as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as unknown as { id: string }).id;
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes('branch: sdd/') || !proposal.includes('base_branch: main')) {
    throw new Error(`binding keys missing in proposal:\n${proposal}`);
  }
});

bdd.given('一个已完成 start 并在特性分支有新提交的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-add-feature';
  const proposalDir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(proposalDir, { recursive: true });
  writeFileSync(join(proposalDir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\n\nTODO\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  writeFileSync(join(repo.root, 'feature.txt'), 'hello\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat: hello']);
  ctx.fixtures['仓库'] = { root: repo.root, repo } as unknown as Record<string, unknown>;
  ctx.fixtures['change'] = { id };
});

bdd.when('对其运行 change finalize', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as unknown as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as unknown as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'finalize', id]);
  ctx.fixtures['finalize结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
  } satisfies CliResult as unknown as Record<string, unknown>;
});

bdd.thenStep('目标分支获得单条 archive(sdd) 提交', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as unknown as { repo: TempRepo }).repo;
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if (subjects[0] !== 'archive(sdd): demo-add-feature') {
    throw new Error(`expected archive close-out commit, got: ${subjects.join(' | ')}`);
  }
});

bdd.thenStep('changes 目录下只剩 archive 改名产物', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as unknown as { repo: TempRepo }).repo;
  const entries = readdirSync(join(repo.root, 'llmanspec', 'changes')).toSorted();
  if (entries.length !== 1 || entries[0] !== 'archive') {
    throw new Error(`expected only archive/ under changes/, got ${entries.join(', ')}`);
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'archive'))) {
    throw new Error('archive dir missing');
  }
});

bdd.thenStep('特性分支上的变更内容出现在目标分支', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as unknown as { repo: TempRepo }).repo;
  if (!existsSync(join(repo.root, 'feature.txt'))) {
    throw new Error('feature.txt did not land on target branch');
  }
});

// ---------------------------------------------------------------------------
// init-generators capability — v2 render vs golden baseline (normalized)
// ---------------------------------------------------------------------------

const ETHICS_KEYS = [
  'ethics.risk_level',
  'ethics.prohibited_actions',
  'ethics.required_evidence',
  'ethics.refusal_contract',
  'ethics.escalation_policy',
];

bdd.given('本仓库的等价 config(zh-Hans 与 bdd 配置)', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-init-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nlocale: zh-Hans\n\nbdd:\n  run_command: "bun test tests/bdd"\n  bindings:\n    - kind: tags\n      tags: [executable]\n',
  );
  ctx.fixtures['init'] = { root };
});

bdd.when('v2 渲染全部 skills', (ctx) => {
  const root = (ctx.fixtures['init'] as unknown as { root: string }).root;
  runInit(root, { update: true, version: '0.1.0' });
});

bdd.thenStep('与 golden 基线归一化版本号后 diff 为空', (ctx) => {
  const root = (ctx.fixtures['init'] as unknown as { root: string }).root;
  const baselineDir = join(
    import.meta.dirname,
    '..',
    '..',
    '..',
    'tests',
    'golden',
    'baseline',
    'skills',
  );
  const versionRe = /\b\d+\.\d+\.\d+\b/gu;
  const readTree = (dir: string): Map<string, string> => {
    const out = new Map<string, string>();
    const walk = (rel: string): void => {
      for (const name of readdirSync(join(dir, rel)).toSorted()) {
        const child = rel === '' ? name : `${rel}/${name}`;
        if (statSync(join(dir, child)).isDirectory()) walk(child);
        else out.set(child, readFileSync(join(dir, child), 'utf8').replaceAll(versionRe, '<VER>'));
      }
    };
    walk('');
    return out;
  };
  const baseline = readTree(baselineDir);
  const produced = readTree(join(root, '.agents', 'skills'));
  for (const [file, content] of baseline) {
    if (produced.get(file) !== content) {
      throw new Error(`rendered product ${file} differs from golden baseline`);
    }
  }
  if (produced.size !== baseline.size) {
    throw new Error(`file count mismatch: baseline ${baseline.size} vs v2 ${produced.size}`);
  }
});

bdd.thenStep('每个 SKILL.md 通过 ethics 治理门', (ctx) => {
  const root = (ctx.fixtures['init'] as unknown as { root: string }).root;
  const skillsDir = join(root, '.agents', 'skills');
  for (const dir of readdirSync(skillsDir)) {
    const content = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8');
    for (const key of ETHICS_KEYS) {
      if (!content.includes(key)) throw new Error(`${dir}/SKILL.md missing ethics key ${key}`);
    }
  }
});

// ---------------------------------------------------------------------------
// peripheral-commands capability — live v1 ↔ v2 comparison
// ---------------------------------------------------------------------------

function normalizeCliText(s: string): string {
  return s
    .split('\n')
    .map((l) => l.trim().replaceAll(/\s+/gu, ' '))
    .filter((l) => l !== '' && !l.startsWith('INFO:'))
    .join('\n')
    .replaceAll(/\b\d+[smhd]\s+ago\b/gu, '<REL>')
    .replaceAll('just now', '<REL>')
    .replaceAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/gu, '<TS>');
}

interface CliPairResult {
  same: boolean;
  sample: string;
}

bdd.given('本仓库的真实 llmanspec 工作区', (ctx) => {
  ctx.fixtures['工作区'] = { root: REPO_ROOT };
});

bdd.when('分别运行 v1 与 v2 的 list/show/graph 命令', (ctx) => {
  const run = (cmd: string, args: string[]): string => {
    const proc = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
    return proc.stdout ?? '';
  };
  const pairs: [string[], string[]][] = [
    [
      ['sdd', 'list', '--json'],
      ['list', '--json'],
    ],
    [
      ['sdd', 'list', '--specs', '--json'],
      ['list', '--specs', '--json'],
    ],
    [
      ['sdd', 'graph', '--format', 'mermaid'],
      ['graph', '--format', 'mermaid'],
    ],
  ];
  const compared = pairs.map(([v1, v2]) => {
    const a = normalizeCliText(run('llman', v1));
    const b = normalizeCliText(run('bun', [CLI, ...v2]));
    const sorted = v1.includes('graph');
    return sorted
      ? a.split('\n').toSorted().join('\n') === b.split('\n').toSorted().join('\n')
      : a === b;
  });
  ctx.fixtures['对比结果'] = {
    same: compared.every(Boolean),
    sample: compared.join(','),
  } satisfies CliPairResult as unknown as Record<string, unknown>;
});

bdd.thenStep('归一化后的输出结构一致', (ctx) => {
  const result = ctx.fixtures['对比结果'] as unknown as CliPairResult | undefined;
  if (!result?.same) {
    throw new Error(`v1/v2 outputs diverge (${result?.sample ?? 'no result'})`);
  }
});

// ---------------------------------------------------------------------------
// review-freeze capability — live v1 ↔ v2 review + v1 freeze → v2 thaw
// ---------------------------------------------------------------------------

bdd.when('v2 运行 review', (ctx) => {
  const proc = spawnSync('bun', [CLI, 'review', '--json'], { cwd: REPO_ROOT, encoding: 'utf8' });
  const out = proc.stdout ?? '';
  try {
    const parsed = JSON.parse(out) as {
      signals: { kind: string }[];
      summary: Record<string, number>;
    };
    const kinds = new Set(parsed.signals.map((s) => s.kind));
    ctx.fixtures['review'] = {
      kinds,
      summary: parsed.summary,
      exitCode: proc.status ?? 1,
    } as unknown as Record<string, unknown>;
  } catch (error) {
    throw new Error(`review --json invalid: ${(error as Error).message}\n${out.slice(0, 300)}`, {
      cause: error,
    });
  }
});

bdd.thenStep('signals 覆盖六种 kind', (ctx) => {
  const kinds = (ctx.fixtures['review'] as unknown as { kinds: Set<string> }).kinds;
  for (const kind of ['pending', 'manual', 'unbound', 'stale', 'locked', 'validate']) {
    if (!kinds.has(kind)) throw new Error(`missing signal kind: ${kind}`);
  }
});

bdd.thenStep('summary 含 criticalCount 与 warningCount', (ctx) => {
  const summary = (ctx.fixtures['review'] as unknown as { summary: Record<string, number> })
    .summary;
  if (typeof summary['criticalCount'] !== 'number' || typeof summary['warningCount'] !== 'number') {
    throw new TypeError(`summary missing counts: ${JSON.stringify(summary)}`);
  }
});

bdd.given('一个含已归档目录的临时仓库且已用 v1 冻结', (ctx) => {
  const repo = makeTempRepo();
  const archiveDir = join(repo.root, 'llmanspec', 'changes', 'archive');
  mkdirSync(join(archiveDir, '2026-01-01-old-demo'), { recursive: true });
  writeFileSync(join(archiveDir, '2026-01-01-old-demo', 'proposal.md'), '# frozen demo\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'archive dir']);
  repo.run('llman', ['sdd', 'archive', 'freeze', '--before', '2026-02-01']);
  if (!existsSync(join(archiveDir, 'freezed_changes.7z.archived'))) {
    throw new Error('v1 freeze did not produce the cold-backup archive');
  }
  ctx.fixtures['冻结仓库'] = { root: repo.root, repo } as unknown as Record<string, unknown>;
});

bdd.when('v2 运行 thaw 回置该目录', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as unknown as { repo: TempRepo }).repo;
  const result = repo.run('bun', [CLI, 'archive', 'thaw', '--change', '2026-01-01-old-demo']);
  ctx.fixtures['thaw结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
  } satisfies CliResult as unknown as Record<string, unknown>;
});

bdd.thenStep('目录完整回到 changes/archive 下', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as unknown as { repo: TempRepo }).repo;
  if (!existsSync(join(repo.root, 'llmanspec/changes/archive/2026-01-01-old-demo/proposal.md'))) {
    throw new Error('thawed dir missing proposal.md');
  }
});

bdd.thenStep('内容与冻结前一致', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as unknown as { repo: TempRepo }).repo;
  const content = readFileSync(
    join(repo.root, 'llmanspec/changes/archive/2026-01-01-old-demo/proposal.md'),
    'utf8',
  );
  if (!content.includes('# frozen demo')) throw new Error(`content drifted: ${content}`);
});

bdd.thenStep('退出码与 criticalCount 一致', (ctx) => {
  const review = ctx.fixtures['review'] as unknown as
    | {
        exitCode: number;
        summary: { criticalCount: number };
      }
    | undefined;
  if (!review) throw new Error('no review fixture');
  const expected = review.summary.criticalCount > 0 ? 1 : 0;
  if (review.exitCode !== expected) {
    throw new Error(
      `exit ${review.exitCode} inconsistent with criticalCount ${review.summary.criticalCount}`,
    );
  }
});

// ---------------------------------------------------------------------------
// context-index capability — rebuild/check freshness cycle + env contract
// ---------------------------------------------------------------------------

interface CheckResult {
  exitCode: number;
  output: string;
}

bdd.given('一个含 specs 的临时仓库', (ctx) => {
  ctx.fixtures['idx仓库'] = { repo: makeTempRepo() } as unknown as Record<string, unknown>;
});

bdd.when('rebuild 后立即 check', (ctx) => {
  const repo = (ctx.fixtures['idx仓库'] as unknown as { repo: TempRepo }).repo;
  repo.run('bun', [CLI, 'index', 'rebuild']);
  const check = repo.run('bun', [CLI, 'index', 'check']);
  ctx.fixtures['check结果'] = {
    exitCode: check.code,
    output: check.stdout,
  } satisfies CheckResult as unknown as Record<string, unknown>;
});

bdd.thenStep('报告 fresh', (ctx) => {
  const result = ctx.fixtures['check结果'] as unknown as CheckResult | undefined;
  if (result?.exitCode !== 0 || !result.output.includes('fresh')) {
    throw new Error(`expected fresh, got exit=${result?.exitCode} output=${result?.output}`);
  }
});

bdd.when('修改任一 spec 后再 check', (ctx) => {
  const repo = (ctx.fixtures['idx仓库'] as unknown as { repo: TempRepo }).repo;
  const specPath = join(repo.root, 'llmanspec', 'specs', 'sample.feature');
  writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n# touched\n`);
  const check = repo.run('bun', [CLI, 'index', 'check']);
  ctx.fixtures['check结果'] = {
    exitCode: check.code,
    output: check.stdout,
  } satisfies CheckResult as unknown as Record<string, unknown>;
});

bdd.thenStep('报告 stale', (ctx) => {
  const result = ctx.fixtures['check结果'] as unknown as CheckResult | undefined;
  if (!result) throw new Error('no check result');
  if (result.exitCode === 0 || !result.output.includes('stale')) {
    throw new Error(`expected stale, got exit=${result.exitCode} output=${result.output}`);
  }
});

bdd.given('环境未设置 LLMAN_SDD_INDEX_CHAT_MODEL', (ctx) => {
  ctx.fixtures['env无模型'] = { value: true } as unknown as Record<string, unknown>;
});

bdd.when('运行 context --task', (ctx) => {
  void (ctx.fixtures['env无模型'] as unknown as { value: boolean } | undefined);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('LLMAN_SDD_INDEX_')) env[k] = v;
  }
  const proc = spawnSync('bun', [CLI, 'context', '--task', '随便什么任务'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
  });
  let parsed: { status: { quality: string; errorKind?: string } } | null = null;
  try {
    parsed = JSON.parse(proc.stdout ?? '{}');
  } catch {
    parsed = null;
  }
  ctx.fixtures['context结果'] = {
    quality: parsed?.status?.quality ?? 'no-output',
    errorKind: parsed?.status?.errorKind ?? 'none',
  } as unknown as Record<string, unknown>;
});

bdd.thenStep('quality 为 unavailable', (ctx) => {
  const result = ctx.fixtures['context结果'] as unknown as { quality: string } | undefined;
  if (result?.quality !== 'unavailable') {
    throw new Error(`expected quality=unavailable, got ${result?.quality}`);
  }
});

bdd.thenStep('不发起任何网络请求', (ctx) => {
  // unavailable 分支在发请求前返回;errorKind 必为 api_error 而非网络错误
  const result = ctx.fixtures['context结果'] as unknown as { errorKind: string } | undefined;
  if (result?.errorKind !== 'api_error') {
    throw new Error(`expected api_error (pre-request), got ${result?.errorKind}`);
  }
});
