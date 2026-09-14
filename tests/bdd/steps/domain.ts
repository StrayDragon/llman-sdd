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

const CLI = join(import.meta.dirname, '..', '..', '..', 'apps', 'cli', 'src', 'main.ts');

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
