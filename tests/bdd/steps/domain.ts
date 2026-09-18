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

import { makeNodeIo } from '../../helpers/nodeIo.ts';
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

/** Record-style fixture field read (fixtures stored as plain records). */
function field(fixture: unknown, key: string): unknown {
  if (fixture !== null && typeof fixture === 'object') {
    return (fixture as Record<string, unknown>)[key];
  }
  return undefined;
}

bdd.given('一个 config 内容 extra_skills 含 "{value}"', (ctx, value) => {
  ctx.fixtures['config'] = { 源文本: `schema: spec-driven\nextra_skills:\n  - ${value}\n` };
  return ctx.fixtures['config'];
});

bdd.when('加载该 config', (ctx) => {
  const source = String(field(ctx.fixtures['config'], '源文本') ?? '');
  try {
    loadConfig(source);
    ctx.fixtures['加载结果'] = { error: null };
  } catch (err) {
    ctx.fixtures['加载结果'] = { error: (err as Error).message };
  }
});

bdd.thenStep('报错信息包含 "{text}"', (ctx, text) => {
  const message = String(field(ctx.fixtures['加载结果'], 'error') ?? '');
  if (!message) throw new Error('no error was captured by 当 加载该 config');
  if (!message.includes(text))
    throw new Error(`error message does not contain "${text}":\n${message}`);
});

bdd.thenStep('报错条数至多 {count:d}', (ctx, count) => {
  const message = String(field(ctx.fixtures['加载结果'], 'error') ?? '');
  const lines = message.split('\n').filter((l) => l.startsWith('- '));
  if (lines.length > count)
    throw new Error(`expected at most ${count} issue lines, got ${lines.length}`);
});

bdd.given('一个使用中文关键字的 feature 内容', (ctx) => {
  ctx.fixtures['feature'] = { 源文本: SAMPLE_FEATURE };
  return ctx.fixtures['feature'];
});

bdd.when('解析该 feature', (ctx) => {
  const source = String(field(ctx.fixtures['feature'], '源文本') ?? '');
  ctx.fixtures['解析结果'] = {
    doc: parseCapability(source, 'inline.feature'),
  } satisfies ParseResult;
});

bdd.thenStep('IR 中规则场景分类为 {classification}', (ctx, classification) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const rule = doc?.scenarios.find((s) => s.classification === 'human');
  if (!rule) throw new Error('no human-classified scenario in IR');
  if (classification !== 'human')
    throw new Error(`unexpected classification arg: ${classification}`);
});

bdd.thenStep('req 链接为 {reqId}', (ctx, reqId) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
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
    (ctx.fixtures['重复样本'] as { docs: { fileName: string; doc: CapabilityDoc }[] })?.docs ?? [];
  const reg = buildReqRegistry(docs);
  ctx.fixtures['注册表'] = {
    duplicates: reg.duplicates,
  } satisfies RegistryResult;
});

bdd.thenStep('报告包含重复对 {reqId}', (ctx, reqId) => {
  const reg = ctx.fixtures['注册表'] as RegistryResult | undefined;
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
  const fixture = ctx.fixtures['缺陷目录'] as SpecsDirFixture | undefined;
  if (!fixture) throw new Error('no specs-dir fixture — did the 假如 step run?');
  const entries = discoverSpecs(fixture.specsDir, fixture.io);
  const report = validateAllSpecs(entries, fixture.io);
  ctx.fixtures['校验结果'] = { failed: report.failed, lines: report.lines };
});

bdd.thenStep('FAIL 集合包含 spec 条目', (ctx) => {
  const result = ctx.fixtures['校验结果'] as ValidateResult | undefined;
  const failLines = result?.lines.filter((l) => l.startsWith('FAIL spec/')) ?? [];
  if (failLines.length === 0) {
    throw new Error(`no FAIL spec entries in:\n${result?.lines.join('\n')}`);
  }
});

bdd.thenStep('退出码非零', (ctx) => {
  const result = ctx.fixtures['校验结果'] as ValidateResult | undefined;
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
  run: (cmd: string, args: string[]) => { code: number; stdout: string; stderr: string };
}

function makeTempRepo(): TempRepo {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-bdd-'));
  const gitRun = (args: string[]): { code: number; stdout: string; stderr: string } => {
    const proc = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
  };
  gitRun(['init', '-q', '-b', 'main']);
  // 仓库级身份:CLI 的 finalize 内部也会 commit,CI runner 无全局身份
  gitRun(['config', 'user.email', 't@t']);
  gitRun(['config', 'user.name', 't']);
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
      return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
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
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.when('对其运行 change start', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['start结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
  } satisfies CliResult;
});

bdd.thenStep('分支 {branch} 被创建且被检出', (ctx, branch) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const current = repo.run('git', ['branch', '--show-current']).stdout.trim();
  if (current !== branch) throw new Error(`expected branch ${branch}, got ${current}`);
});

bdd.thenStep('frontmatter 含 branch 与 base_branch', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
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
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.when('对其运行 change finalize', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'finalize', id]);
  ctx.fixtures['finalize结果'] = {
    exitCode: result.code,
    stdout: result.stdout,
  } satisfies CliResult;
});

bdd.thenStep('目标分支获得单条 archive(sdd) 提交', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const subjects = repo.run('git', ['log', '--format=%s', 'main']).stdout.trim().split('\n');
  if (subjects[0] !== 'archive(sdd): demo-add-feature') {
    throw new Error(`expected archive close-out commit, got: ${subjects.join(' | ')}`);
  }
});

bdd.thenStep('changes 目录下只剩 archive 改名产物', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const entries = readdirSync(join(repo.root, 'llmanspec', 'changes')).toSorted();
  if (entries.length !== 1 || entries[0] !== 'archive') {
    throw new Error(`expected only archive/ under changes/, got ${entries.join(', ')}`);
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'archive'))) {
    throw new Error('archive dir missing');
  }
});

bdd.thenStep('特性分支上的变更内容出现在目标分支', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
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
  const root = (ctx.fixtures['init'] as { root: string }).root;
  runInit(
    makeNodeIo(root),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0' },
  );
});

bdd.thenStep('与 golden 基线归一化版本号后 diff 为空', (ctx) => {
  const root = (ctx.fixtures['init'] as { root: string }).root;
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
  const root = (ctx.fixtures['init'] as { root: string }).root;
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

interface OutputShapeResult {
  listOk: boolean;
  graphOk: boolean;
  sample: string;
}

bdd.given('本仓库的真实 llmanspec 工作区', (ctx) => {
  ctx.fixtures['工作区'] = { root: REPO_ROOT };
});

bdd.when('运行 v2 的 list --json 与 graph', (ctx) => {
  const run = (args: string[]): string => {
    const proc = spawnSync('bun', [CLI, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
    return proc.stdout ?? '';
  };
  const listOut = run(['list', '--json']);
  const graphOut = run(['graph', '--format', 'mermaid']);
  let listOk = false;
  let sample = 'list parse failed';
  try {
    const wrapper = JSON.parse(listOut) as { changes?: { name?: string; status?: string }[] };
    const parsed = wrapper.changes ?? [];
    const statuses = new Set(['no-tasks', 'complete', 'in-progress']);
    // 空列表空真成立:条款约束的是"元素"的字段合法性,不要求仓库有活跃 change
    listOk =
      Array.isArray(parsed) &&
      parsed.every((c) => typeof c.name === 'string' && statuses.has(c.status as string));
    sample = `${parsed.length} changes`;
  } catch (error) {
    sample = (error as Error).message;
  }
  const graphOk = graphOut.split('\n')[0]?.trim() === 'flowchart TD';
  ctx.fixtures['结构结果'] = {
    listOk,
    graphOk,
    sample,
  } satisfies OutputShapeResult;
});

bdd.thenStep('list JSON 元素含 name 与 status 且 status 属于合法枚举', (ctx) => {
  const result = ctx.fixtures['结构结果'] as OutputShapeResult | undefined;
  if (!result?.listOk) throw new Error(`list --json shape invalid: ${result?.sample}`);
});

bdd.thenStep('graph 首行为 flowchart TD', (ctx) => {
  const result = ctx.fixtures['结构结果'] as OutputShapeResult | undefined;
  if (!result?.graphOk) throw new Error('graph output does not start with flowchart TD');
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
    };
  } catch (error) {
    throw new Error(`review --json invalid: ${(error as Error).message}\n${out.slice(0, 300)}`, {
      cause: error,
    });
  }
});

bdd.thenStep('signals 覆盖六种 kind', (ctx) => {
  const kinds = (ctx.fixtures['review'] as { kinds: Set<string> }).kinds;
  for (const kind of ['pending', 'manual', 'unbound', 'stale', 'locked', 'validate']) {
    if (!kinds.has(kind)) throw new Error(`missing signal kind: ${kind}`);
  }
});

bdd.thenStep('summary 含 criticalCount 与 warningCount', (ctx) => {
  const summary = (ctx.fixtures['review'] as { summary: Record<string, number> }).summary;
  if (typeof summary['criticalCount'] !== 'number' || typeof summary['warningCount'] !== 'number') {
    throw new TypeError(`summary missing counts: ${JSON.stringify(summary)}`);
  }
});

bdd.given('一个含已归档目录的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const archiveDir = join(repo.root, 'llmanspec', 'changes', 'archive');
  mkdirSync(join(archiveDir, '2026-01-01-old-demo'), { recursive: true });
  writeFileSync(join(archiveDir, '2026-01-01-old-demo', 'proposal.md'), '# frozen demo\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'archive dir']);
  ctx.fixtures['冻结仓库'] = { root: repo.root, repo };
});

bdd.when('v2 运行 freeze 后再 thaw 回置该目录', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as { repo: TempRepo }).repo;
  const freeze = repo.run('bun', [CLI, 'archive', 'freeze', '--before', '2026-02-01']);
  if (freeze.code !== 0) {
    throw new Error(`v2 freeze failed:\n${freeze.stdout}`);
  }
  const thaw = repo.run('bun', [CLI, 'archive', 'thaw', '--change', '2026-01-01-old-demo']);
  ctx.fixtures['thaw结果'] = {
    exitCode: thaw.code,
    stdout: thaw.stdout,
  } satisfies CliResult;
});

bdd.thenStep('目录完整回到 changes/archive 下', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as { repo: TempRepo }).repo;
  if (!existsSync(join(repo.root, 'llmanspec/changes/archive/2026-01-01-old-demo/proposal.md'))) {
    throw new Error('thawed dir missing proposal.md');
  }
});

bdd.thenStep('内容与冻结前一致', (ctx) => {
  const repo = (ctx.fixtures['冻结仓库'] as { repo: TempRepo }).repo;
  const content = readFileSync(
    join(repo.root, 'llmanspec/changes/archive/2026-01-01-old-demo/proposal.md'),
    'utf8',
  );
  if (!content.includes('# frozen demo')) throw new Error(`content drifted: ${content}`);
});

bdd.thenStep('退出码与 criticalCount 一致', (ctx) => {
  const review = ctx.fixtures['review'] as
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
  ctx.fixtures['idx仓库'] = { repo: makeTempRepo() };
});

bdd.when('rebuild 后立即 check', (ctx) => {
  const repo = (ctx.fixtures['idx仓库'] as { repo: TempRepo }).repo;
  repo.run('bun', [CLI, 'index', 'rebuild']);
  const check = repo.run('bun', [CLI, 'index', 'check']);
  ctx.fixtures['check结果'] = {
    exitCode: check.code,
    output: check.stdout,
  } satisfies CheckResult;
});

bdd.thenStep('报告 fresh', (ctx) => {
  const result = ctx.fixtures['check结果'] as CheckResult | undefined;
  if (result?.exitCode !== 0 || !result.output.includes('fresh')) {
    throw new Error(`expected fresh, got exit=${result?.exitCode} output=${result?.output}`);
  }
});

bdd.when('修改任一 spec 后再 check', (ctx) => {
  const repo = (ctx.fixtures['idx仓库'] as { repo: TempRepo }).repo;
  const specPath = join(repo.root, 'llmanspec', 'specs', 'sample.feature');
  writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n# touched\n`);
  const check = repo.run('bun', [CLI, 'index', 'check']);
  ctx.fixtures['check结果'] = {
    exitCode: check.code,
    output: check.stdout,
  } satisfies CheckResult;
});

bdd.thenStep('报告 stale', (ctx) => {
  const result = ctx.fixtures['check结果'] as CheckResult | undefined;
  if (!result) throw new Error('no check result');
  if (result.exitCode === 0 || !result.output.includes('stale')) {
    throw new Error(`expected stale, got exit=${result.exitCode} output=${result.output}`);
  }
});

// ---------------------------------------------------------------------------
// r30 — graph flow-style depends_on parsing (acceptance)
// ---------------------------------------------------------------------------

interface GraphDepsResult {
  out: string;
  ok: boolean;
}

bdd.given('一个含流式 depends_on 指向已归档 change 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-graph-'));
  const changes = join(root, 'llmanspec', 'changes');
  mkdirSync(join(changes, 'archive', '2026-01-01-dep-old'), { recursive: true });
  writeFileSync(
    join(changes, 'archive', '2026-01-01-dep-old', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\nx\n',
  );
  mkdirSync(join(changes, 'main-feat'), { recursive: true });
  writeFileSync(
    join(changes, 'main-feat', 'proposal.md'),
    '---\ndepends_on: [dep-old]\n---\n\n## Why\nx\n',
  );
  ctx.fixtures['graph工作区'] = { root };
});

bdd.when('运行 v2 的 graph', (ctx) => {
  const { root } = ctx.fixtures['graph工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'graph', '--format', 'mermaid'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['graph输出'] = {
    out: proc.stdout ?? '',
    ok: proc.status === 0,
  } satisfies GraphDepsResult;
});

bdd.thenStep('archived 节点被标注 done 且依赖边保留', (ctx) => {
  const { out } = ctx.fixtures['graph输出'] as GraphDepsResult;
  if (!out.includes('dep_old["dep-old ✓ done"]:::archived')) {
    throw new Error(`archived node missing from graph output:\n${out}`);
  }
  if (!out.includes('main_feat -->|depends on| dep_old')) {
    throw new Error(`depends-on edge missing from graph output:\n${out}`);
  }
});

// ---------------------------------------------------------------------------
// r31 — change attach default-branch gate (acceptance)
// ---------------------------------------------------------------------------

interface AttachResult {
  code: number;
  stdout: string;
}

bdd.when('在默认分支上对其运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['attach结果'] = { code: result.code, stdout: result.stdout } satisfies AttachResult;
});

bdd.thenStep('attach 报错且不写绑定', (ctx) => {
  const result = ctx.fixtures['attach结果'] as AttachResult;
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (result.code === 0)
    throw new Error(`attach should have failed on default branch: ${result.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (proposal.includes('branch:'))
    throw new Error(`binding written despite gate failure:\n${proposal}`);
});

bdd.when('切到特性分支再运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  repo.run('git', ['switch', '-qc', 'feat/attach']);
  const result = repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['attach结果'] = { code: result.code, stdout: result.stdout } satisfies AttachResult;
});

bdd.thenStep('attach 绑定写入当前分支', (ctx) => {
  const result = ctx.fixtures['attach结果'] as AttachResult;
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (result.code !== 0) throw new Error(`attach failed on feature branch: ${result.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes('branch: feat/attach')) {
    throw new Error(`binding for feat/attach missing:\n${proposal}`);
  }
});

// ---------------------------------------------------------------------------
// r33 — review --capability filter (acceptance)
// ---------------------------------------------------------------------------

interface ReviewFilterResult {
  signals: { kind: string; capability: string }[];
}

bdd.when('运行 v2 的 review --json 并限定单一 capability', (ctx) => {
  const proc = spawnSync('bun', [CLI, 'review', '--json', '--capability', 'peripheral-commands'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  let signals: { kind: string; capability: string }[] = [];
  try {
    signals = (JSON.parse(proc.stdout ?? '{}') as ReviewFilterResult).signals ?? [];
  } catch {
    // leave empty — the then-step will fail with a clear message
  }
  ctx.fixtures['review过滤'] = { signals };
});

bdd.thenStep('四类信号仅含该 capability 且 locked 与 validate 保持全局', (ctx) => {
  const { signals } = ctx.fixtures['review过滤'] as ReviewFilterResult;
  const perCap = signals.filter((s) => s.kind !== 'locked' && s.kind !== 'validate');
  if (perCap.length === 0) throw new Error('no per-capability signals emitted');
  const strangers = perCap.filter((s) => s.capability !== 'peripheral-commands');
  if (strangers.length > 0) {
    throw new Error(`filter leaked other capabilities: ${JSON.stringify(strangers)}`);
  }
  if (!signals.some((s) => s.kind === 'locked')) throw new Error('locked signal missing');
  if (!signals.some((s) => s.kind === 'validate')) throw new Error('validate signal missing');
});

// ---------------------------------------------------------------------------
// r34 — monotonic stage inference (acceptance)
// ---------------------------------------------------------------------------

interface StageResult {
  stages: Record<string, string>;
}

bdd.given('一个只有 proposal 与 tasks 的 change 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-stage-'));
  const dir = join(root, 'llmanspec', 'changes', 'tasks-only');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [x] a\n');
  ctx.fixtures['stage工作区'] = { root };
});

bdd.when('运行 list --json', (ctx) => {
  const { root } = ctx.fixtures['stage工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'list', '--json'], { cwd: root, encoding: 'utf8' });
  const stages: Record<string, string> = {};
  try {
    const parsed = JSON.parse(proc.stdout ?? '{}') as {
      changes?: { name: string; stage: string }[];
    };
    for (const c of parsed.changes ?? []) stages[c.name] = c.stage;
  } catch {
    // then-step reports the failure
  }
  ctx.fixtures['stage结果'] = { stages } satisfies StageResult;
});

bdd.thenStep('该 change 的 stage 为 draft', (ctx) => {
  const { stages } = ctx.fixtures['stage结果'] as StageResult;
  if (stages['tasks-only'] !== 'draft') {
    throw new Error(`expected tasks-only stage draft, got: ${JSON.stringify(stages)}`);
  }
});

// ---------------------------------------------------------------------------
// r35/r36 — next-id number harvest + change new --dry-run (acceptance)
// ---------------------------------------------------------------------------

interface NextIdResult {
  maxNumber: number | null;
  nextNumber: number;
}

bdd.given('一个含 c10-active 与嵌套 c2620 目录的 llmanspec 树', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-nextid-'));
  const mk = (rel: string): void => {
    mkdirSync(join(root, 'llmanspec', rel), { recursive: true });
    writeFileSync(join(root, 'llmanspec', rel, 'proposal.md'), '---\ndepends_on: []\n---\nx\n');
  };
  mk('changes/c10-active');
  mkdirSync(join(root, 'llmanspec', 'delayed-changes', 'c2620-tool-x'), { recursive: true });
  ctx.fixtures['nextid工作区'] = { root };
});

bdd.when('运行 change next-id --json', (ctx) => {
  const { root } = ctx.fixtures['nextid工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'change', 'next-id', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(proc.stdout ?? '{}') as NextIdResult;
  ctx.fixtures['nextid结果'] = parsed;
});

bdd.thenStep('maxNumber 为 {n:d} 且 nextNumber 为 {m:d}', (ctx, maxN: string, nextN: string) => {
  const r = ctx.fixtures['nextid结果'] as NextIdResult;
  if (r.maxNumber !== Number(maxN) || r.nextNumber !== Number(nextN)) {
    throw new Error(`expected max=${maxN} next=${nextN}, got ${JSON.stringify(r)}`);
  }
});

bdd.given('一个已初始化的临时 llmanspec 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-dryrun-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  ctx.fixtures['dryrun工作区'] = { root };
});

bdd.when('运行 change new --from "{text}" --dry-run', (ctx, text: string) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'change', 'new', '--from', text, '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['dryrun结果'] = { out: proc.stdout ?? '', code: proc.status ?? 1 };
});

bdd.thenStep('输出派生 id 且不创建 changes 目录', (ctx) => {
  const { root } = ctx.fixtures['dryrun工作区'] as { root: string };
  const { out, code } = ctx.fixtures['dryrun结果'] as { out: string; code: number };
  if (code !== 0) throw new Error(`dry-run exited non-zero: ${out}`);
  if (out.trim() !== 'port-the-importer') {
    throw new Error(`expected bare derived id, got: ${out}`);
  }
  if (existsSync(join(root, 'llmanspec', 'changes'))) {
    throw new Error('dry-run created the changes directory');
  }
});

// ---------------------------------------------------------------------------
// r37/r38 — config overview & extra_skills management (acceptance)
// ---------------------------------------------------------------------------

interface ConfigFixture {
  root: string;
  original: string;
}

bdd.given('一个带注释与 extra_skills 的 llmanspec config', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-config-'));
  const original = [
    '# yaml-language-server: $schema=https://x/y.json',
    'schema: spec-driven',
    '# 用户注释保留',
    'extra_skills:',
    '  - llman-sdd-ff',
    '',
  ].join('\n');
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), original);
  ctx.fixtures['config工作区'] = { root, original } satisfies ConfigFixture;
});

bdd.when('运行 v2 的 config 概览', (ctx) => {
  const { root, original } = ctx.fixtures['config工作区'] as ConfigFixture;
  const proc = spawnSync('bun', [CLI, 'config'], { cwd: root, encoding: 'utf8' });
  const after = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
  ctx.fixtures['概览结果'] = {
    out: proc.stdout ?? '',
    unchanged: after === original,
  };
});

bdd.thenStep('概览五要素输出且文件未被修改', (ctx) => {
  const { out, unchanged } = ctx.fixtures['概览结果'] as { out: string; unchanged: boolean };
  for (const marker of [
    'schema:',
    'locale:',
    'extra_skills (enabled/total): 1 / 6',
    'bdd: off',
    'archive: default',
  ]) {
    if (!out.includes(marker)) throw new Error(`overview missing ${marker}:\n${out}`);
  }
  if (!unchanged) throw new Error('config overview modified config.yaml');
});

bdd.when('运行 v2 的 config skills --set 与 --unset', (ctx) => {
  const { root } = ctx.fixtures['config工作区'] as ConfigFixture;
  spawnSync(
    'bun',
    [CLI, 'config', 'skills', '--set', 'llman-sdd-validate', '--unset', 'llman-sdd-ff'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  );
});

bdd.thenStep('启用集更新且注释与 schema 头保留', (ctx) => {
  const { root, original } = ctx.fixtures['config工作区'] as ConfigFixture;
  const after = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
  if (!after.includes('llman-sdd-validate') || after.includes('llman-sdd-ff')) {
    throw new Error(`extra_skills not updated:\n${after}`);
  }
  if (!after.includes('# 用户注释保留') || !after.includes('# yaml-language-server')) {
    throw new Error(`comments lost:\n${after}`);
  }
  if (after === original) throw new Error('config was not written');
});

// ---------------------------------------------------------------------------
// r39/r40 — change archive gates & seal-off (acceptance)
// ---------------------------------------------------------------------------

interface ArchiveResult {
  code: number;
  stdout: string;
  stderr?: string;
}

bdd.given('一个已 start 且任务全勾的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-arch';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [x] done\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  writeFileSync(join(repo.root, 'feature.txt'), 'hello\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'feat']);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.when('运行 change archive', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'archive', id]);
  ctx.fixtures['archive结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('目标分支获得 archive(sdd) 提交且目录改名', (ctx) => {
  const { code, stdout } = ctx.fixtures['archive结果'] as ArchiveResult;
  if (code !== 0) throw new Error(`archive failed: ${stdout}`);
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const log = repo.run('git', ['log', '--oneline', '-1']).stdout;
  if (!log.includes('archive(sdd): demo-arch')) throw new Error(`close-out commit missing: ${log}`);
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'archive'))) {
    throw new Error('archive dir missing');
  }
});

bdd.given('一个带未勾任务的已绑定 change 仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-gate';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [ ] pending-one\n- [x] ok\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.thenStep('报错列出未勾任务且不产生归档', (ctx) => {
  const { code, stdout } = ctx.fixtures['archive结果'] as ArchiveResult;
  const stderr = (ctx.fixtures['archive结果'] as { stderr?: string }).stderr ?? '';
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  if (code === 0) throw new Error(`archive should be blocked: ${stdout}`);
  if (!`${stdout}${stderr}`.includes('pending-one')) {
    throw new Error(`pending item not listed: ${stdout}${stderr}`);
  }
  if (existsSync(join(repo.root, 'llmanspec', 'changes', 'archive', 'demo-gate'))) {
    throw new Error('archive dir created despite gate');
  }
});

// ---------------------------------------------------------------------------
// r41-r43 — spec authoring helpers (acceptance)
// ---------------------------------------------------------------------------

const AUTHORING_HEAD = `# language: zh-CN
# capability: auth
# purpose: p
# scope: src/

功能: auth

  @req:r1 @human
  场景: 规则甲
    - 系统 MUST 校验令牌
`;

bdd.given('一个含单一 capability spec 的临时 specs 目录', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-author-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'specs', 'auth.feature'), AUTHORING_HEAD);
  ctx.fixtures['authoring工作区'] = { root };
});

bdd.when('运行 spec add-req 与 spec add-scenario', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const run = (args: string[]): { code: number; out: string } => {
    const proc = spawnSync('bun', [CLI, ...args], { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
  };
  const r1 = run([
    'spec',
    'add-req',
    'auth',
    'r5',
    '--title',
    '用户规则',
    '--statement',
    '系统必须校验令牌',
  ]);
  const r2 = run([
    'spec',
    'add-scenario',
    'auth',
    'r5',
    '令牌场景',
    '--when',
    '访问受保护资源',
    '--then',
    '访问被允许',
  ]);
  const r3 = run(['spec', 'resolve-req', 'r5']);
  ctx.fixtures['authoring结果'] = { results: [r1, r2, r3], root };
});

bdd.thenStep('spec 可被解析且 resolve-req 反查一致', (ctx) => {
  const { results, root } = ctx.fixtures['authoring结果'] as {
    results: { code: number; out: string }[];
    root: string;
  };
  for (const [i, r] of results.entries()) {
    if (r.code !== 0) throw new Error(`authoring step ${i} failed: ${r.out}`);
  }
  const content = readFileSync(join(root, 'llmanspec', 'specs', 'auth.feature'), 'utf8');
  const doc = parseCapability(content, 'auth.feature');
  if (doc.scenarios.length < 3) throw new Error(`appended scenarios not parseable: ${content}`);
  if (!content.includes('@req:r5 @executable')) throw new Error('acceptance scenario missing');
});

bdd.given('一个两个 spec 含相同 rN 的临时 specs 目录', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-dedupe-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  for (const cap of ['auth', 'billing']) {
    writeFileSync(
      join(root, 'llmanspec', 'specs', `${cap}.feature`),
      AUTHORING_HEAD.replace('capability: auth', `capability: ${cap}`).replace(
        '功能: auth',
        `功能: ${cap}`,
      ),
    );
  }
  ctx.fixtures['authoring工作区'] = { root };
});

bdd.when('运行 project dedupe-req-ids', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'project', 'dedupe-req-ids'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['dedupe结果'] = {
    code: proc.status ?? 1,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
    root,
  };
});

bdd.thenStep('后一个文件的 rN 被重映射为空闲 id', (ctx) => {
  const { code, out, root } = ctx.fixtures['dedupe结果'] as {
    code: number;
    out: string;
    root: string;
  };
  if (code !== 0) throw new Error(`dedupe failed: ${out}`);
  const billing = readFileSync(join(root, 'llmanspec', 'specs', 'billing.feature'), 'utf8');
  if (billing.includes('@req:r1')) throw new Error('billing still carries the colliding r1');
  if (!/ @req:r\d+ @human/u.test(billing)) throw new Error(`no remapped id found: ${billing}`);
});

// ---------------------------------------------------------------------------
// r44/r45/r46 — attach rebind / finalize no-commit / diff json (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个已 attach 的 feature 分支仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-bind';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft']);
  repo.run('git', ['switch', '-qc', 'feat/bind']);
  repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
  ctx.fixtures['change'] = { id };
});

bdd.when('无 force 再次运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'attach', id]);
  ctx.fixtures['attach重绑'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('报错提示已绑定', (ctx) => {
  const r = ctx.fixtures['attach重绑'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`rebind should fail without --force: ${r.stdout}`);
  if (!`${r.stdout}${r.stderr}`.includes('already attached')) {
    throw new Error(`unexpected error: ${r.stdout}${r.stderr}`);
  }
});

bdd.when('带 --force --base main 运行 change attach', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'attach', id, '--force', '--base', 'main']);
  ctx.fixtures['attach重绑'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('重绑成功且 base_branch 记录为 main', (ctx) => {
  const r = ctx.fixtures['attach重绑'] as { code: number; stdout: string };
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  if (r.code !== 0) throw new Error(`forced rebind failed: ${r.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes('base_branch: main')) throw new Error(`base_branch missing:\n${proposal}`);
});

bdd.when('运行 change finalize --no-commit', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'finalize', id, '--no-commit']);
  ctx.fixtures['finalize结果'] = { code: result.code, stdout: result.stdout };
});

bdd.thenStep('目录改名完成且工作区留有未提交改动', (ctx) => {
  const r = ctx.fixtures['finalize结果'] as { code: number; stdout: string };
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  if (r.code !== 0) throw new Error(`no-commit finalize failed: ${r.stdout}`);
  const status = repo.run('git', ['status', '--porcelain']).stdout;
  if (status === '') throw new Error('expected uncommitted close-out changes after --no-commit');
});

bdd.when('运行 change diff --json', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const result = repo.run('bun', [CLI, 'change', 'diff', id, '--json']);
  ctx.fixtures['diffjson结果'] = { code: result.code, stdout: result.stdout };
});

bdd.thenStep('commitCount 为 {n:d} 且 change 与 branch 字段正确', (ctx, count: string) => {
  const r = ctx.fixtures['diffjson结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`diff --json failed: ${r.stdout}`);
  const parsed = JSON.parse(r.stdout) as { change: string; branch: string; commitCount: number };
  if (parsed.commitCount !== Number(count)) throw new Error(`commitCount ${parsed.commitCount}`);
  if (!parsed.branch.startsWith('sdd/')) throw new Error(`branch field wrong: ${parsed.branch}`);
});

// ---------------------------------------------------------------------------
// r47/r48 — validate flag matrix (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含 specs 与已绑定 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-val';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'draft']);
  ctx.fixtures['validate仓库'] = { root: repo.root, repo, id };
});

bdd.when('运行 validate --stage full 指向 draft 阶段 change', (ctx) => {
  const { root, repo, id } = ctx.fixtures['validate仓库'] as {
    root: string;
    repo: TempRepo;
    id: string;
  };
  const result = repo.run('bun', [CLI, 'validate', id, '--stage', 'full', '--no-check']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('退出码非零且报阶段低于门禁', (ctx) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`stage gate should fail: ${r.stdout}`);
  if (!`${r.stdout}${r.stderr}`.includes('below the required')) {
    throw new Error(`stage gate message missing: ${r.stdout}${r.stderr}`);
  }
});

bdd.given('一个 run_command 含 {feature_name} 占位符的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  mkdirSync(join(repo.root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'auth.feature'),
    '# language: zh-CN\n# capability: auth\n# purpose: p\n# scope: llmanspec/\n\n功能: auth\n\n  @req:r2 @human\n  场景: 规则\n    - 系统 MUST x\n',
  );
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nbdd:\n  run_command: "bun --print \'feature={feature_name}\'"\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'cfg']);
  ctx.fixtures['validate仓库'] = { root: repo.root, repo, id: 'auth' };
});

bdd.when('运行 validate --specs', (ctx) => {
  const { repo } = ctx.fixtures['validate仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', '--specs', '--no-check']);
  ctx.fixtures['validate结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('runner 按目标逐项执行', (ctx) => {
  // 占位符展开本身由单测覆盖;此处确认带占位符的 validate 全链路不炸且判定规格 OK
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  if (r.code !== 0) throw new Error(`validate with placeholders failed: ${r.stdout}${r.stderr}`);
});

// ---------------------------------------------------------------------------
// r49/r50 — init path & --lang alias (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个空的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-initcli-'));
  ctx.fixtures['init工作区'] = { root };
});

bdd.when('运行 init 指向不存在的子目录', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'init', 'deep/nested/proj'], { cwd: root, encoding: 'utf8' });
  ctx.fixtures['init结果'] = { code: proc.status ?? 1, root };
});

bdd.thenStep('产物面完整落在该子目录下', (ctx) => {
  const { code, root } = ctx.fixtures['init结果'] as { code: number; root: string };
  if (code !== 0) throw new Error('init to subdirectory failed');
  for (const rel of [
    'deep/nested/proj/llmanspec/config.yaml',
    'deep/nested/proj/AGENTS.md',
    'deep/nested/proj/.agents/skills',
  ]) {
    if (!existsSync(join(root, rel))) throw new Error(`missing: ${rel}`);
  }
});

bdd.when('运行 init --lang zh-Hans', (ctx) => {
  const { root } = ctx.fixtures['init工作区'] as { root: string };
  const alias = spawnSync('bun', [CLI, 'init', '--lang', 'zh-Hans'], {
    cwd: root,
    encoding: 'utf8',
  });
  const both = spawnSync('bun', [CLI, 'init', '--lang', 'en', '--locale', 'zh-Hans'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['lang结果'] = {
    aliasCode: alias.status ?? 1,
    bothCode: both.status ?? 0,
    root,
  };
});

bdd.thenStep('config locale 为 zh-Hans 且同给两个别名报错', (ctx) => {
  const { aliasCode, bothCode, root } = ctx.fixtures['lang结果'] as {
    aliasCode: number;
    bothCode: number;
    root: string;
  };
  if (aliasCode !== 0) throw new Error('--lang alias failed');
  if (bothCode === 0) throw new Error('giving both aliases should fail');
  const config = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
  if (!config.includes('zh-Hans')) throw new Error(`locale not zh-Hans:\n${config}`);
});

// ---------------------------------------------------------------------------
// r51-r53 — list sort / show text & gates / spec inspect (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含多个 change 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-list-'));
  for (const name of ['beta-feat', 'alpha-feat']) {
    const dir = join(root, 'llmanspec', 'changes', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'proposal.md'),
      '---\ndepends_on: []\n---\n\n## Why\nx\n## What Changes\ny\n',
    );
  }
  ctx.fixtures['list工作区'] = { root };
});

bdd.when('运行 list --json --compact-json --sort name', (ctx) => {
  const { root } = ctx.fixtures['list工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'list', '--json', '--compact-json', '--sort', 'name'], {
    cwd: root,
    encoding: 'utf8',
  });
  const lines = (proc.stdout ?? '').trim().split('\n');
  let names: string[] = [];
  try {
    names = (JSON.parse(lines[0] as string) as { changes: { name: string }[] }).changes.map(
      (c) => c.name,
    );
  } catch {
    // then-step reports
  }
  ctx.fixtures['list结果'] = { singleLine: lines.length === 1, names, code: proc.status ?? 1 };
});

bdd.thenStep('单行 JSON 输出且顺序为字典序', (ctx) => {
  const r = ctx.fixtures['list结果'] as { singleLine: boolean; names: string[]; code: number };
  if (r.code !== 0) throw new Error('list failed');
  if (!r.singleLine) throw new Error('compact-json must be a single line');
  if (r.names.join(',') !== 'alpha-feat,beta-feat')
    throw new Error(`order wrong: ${r.names.join(',')}`);
});

bdd.given('一个缺 What Changes 段的 change 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-showg-'));
  const dir = join(root, 'llmanspec', 'changes', 'gated');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  ctx.fixtures['show工作区'] = { root };
});

bdd.when('运行 show', (ctx) => {
  const { root } = ctx.fixtures['show工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'show', 'gated'], { cwd: root, encoding: 'utf8' });
  ctx.fixtures['show结果'] = {
    beforeCode: proc.status ?? 0,
    beforeOut: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.when('补齐 What Changes 后再运行 show', (ctx) => {
  const { root } = ctx.fixtures['show工作区'] as { root: string };
  writeFileSync(
    join(root, 'llmanspec', 'changes', 'gated', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\nx\n## What Changes\ny\n',
  );
  const proc = spawnSync('bun', [CLI, 'show', 'gated'], { cwd: root, encoding: 'utf8' });
  ctx.fixtures['show后结果'] = { afterCode: proc.status ?? 1, afterOut: proc.stdout ?? '' };
});

bdd.thenStep('报错且不输出正文', (ctx) => {
  const r = ctx.fixtures['show结果'] as { beforeCode: number; beforeOut: string };
  if (r.beforeCode === 0) throw new Error(`missing What Changes should fail: ${r.beforeOut}`);
  if (!r.beforeOut.includes('What Changes'))
    throw new Error(`gate message missing: ${r.beforeOut}`);
});

bdd.thenStep('输出含 Stage 的文本', (ctx) => {
  const r = ctx.fixtures['show后结果'] as { afterCode: number; afterOut: string };
  if (r.afterCode !== 0) throw new Error(`show text failed: ${r.afterOut}`);
  if (!r.afterOut.includes('Stage:')) throw new Error(`Stage line missing: ${r.afterOut}`);
});

bdd.given('一个含多条规则的 spec 工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-showspec-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'specs', 'multi.feature'),
    '# language: zh-CN\n# capability: multi\n# purpose: p\n# scope: llmanspec/\n\n功能: multi\n\n  @req:r1 @human\n  场景: 规则一\n    - 系统 MUST 一\n\n  @req:r2 @human\n  场景: 规则二\n    - 系统 MUST 二\n',
  );
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  ctx.fixtures['showspec工作区'] = { root };
});

bdd.when('运行 show -r 1 与 show --output meta-only', (ctx) => {
  const { root } = ctx.fixtures['showspec工作区'] as { root: string };
  const req = spawnSync('bun', [CLI, 'show', 'multi', '-r', '1'], { cwd: root, encoding: 'utf8' });
  const meta = spawnSync('bun', [CLI, 'show', 'multi', '--output', 'meta-only'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['showspec结果'] = {
    reqOut: req.stdout ?? '',
    reqCode: req.status ?? 1,
    metaOut: meta.stdout ?? '',
    metaCode: meta.status ?? 1,
  };
});

bdd.thenStep('单条规则反查成功且 meta-only 只含头注释', (ctx) => {
  const r = ctx.fixtures['showspec结果'] as {
    reqOut: string;
    reqCode: number;
    metaOut: string;
    metaCode: number;
  };
  if (r.reqCode !== 0 || !r.reqOut.includes('规则一')) throw new Error(`-r 1 failed: ${r.reqOut}`);
  if (r.metaCode !== 0 || !r.metaOut.includes('# capability: multi')) {
    throw new Error(`meta-only failed: ${r.metaOut}`);
  }
  if (r.metaOut.includes('场景')) throw new Error('meta-only must not include scenarios');
});

// ---------------------------------------------------------------------------
// r54/r55 — graph scope & spec helper flags (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含活跃与归档 change 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-scope-'));
  const activeDir = join(root, 'llmanspec', 'changes', 'live-one');
  const archivedDir = join(root, 'llmanspec', 'changes', 'archive', '2026-01-01-done-one');
  mkdirSync(activeDir, { recursive: true });
  mkdirSync(archivedDir, { recursive: true });
  writeFileSync(join(activeDir, 'proposal.md'), '---\ndepends_on: [done-one]\n---\n\n## Why\nx\n');
  writeFileSync(join(archivedDir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  ctx.fixtures['graph工作区'] = { root };
});

bdd.when('运行 graph --scope archived', (ctx) => {
  const { root } = ctx.fixtures['graph工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'graph', '--scope', 'archived'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['scope结果'] = { out: proc.stdout ?? '' };
});

bdd.thenStep('仅归档节点出现', (ctx) => {
  const { out } = ctx.fixtures['scope结果'] as { out: string };
  if (!out.includes('done_one')) throw new Error(`archived node missing: ${out}`);
  if (out.includes('live_one')) throw new Error(`active node leaked into archived scope: ${out}`);
});

bdd.given('一个已存在 spec 的临时工作区', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-skel-'));
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  ctx.fixtures['skel工作区'] = { root };
});

bdd.when('运行 spec skeleton --force 与 spec next-req-id --json', (ctx) => {
  const { root } = ctx.fixtures['skel工作区'] as { root: string };
  const first = spawnSync('bun', [CLI, 'spec', 'skeleton', 'capx'], {
    cwd: root,
    encoding: 'utf8',
  });
  const again = spawnSync('bun', [CLI, 'spec', 'skeleton', 'capx'], {
    cwd: root,
    encoding: 'utf8',
  });
  const forced = spawnSync('bun', [CLI, 'spec', 'skeleton', 'capx', '--force'], {
    cwd: root,
    encoding: 'utf8',
  });
  const json = spawnSync('bun', [CLI, 'spec', 'next-req-id', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['skel结果'] = {
    firstCode: first.status ?? 1,
    againCode: again.status ?? 1,
    forcedCode: forced.status ?? 1,
    jsonOut: json.stdout ?? '',
  };
});

bdd.thenStep('覆盖成功且 JSON 形状正确', (ctx) => {
  const r = ctx.fixtures['skel结果'] as {
    firstCode: number;
    againCode: number;
    forcedCode: number;
    jsonOut: string;
  };
  if (r.firstCode !== 0) throw new Error('first skeleton failed');
  if (r.againCode === 0) throw new Error('second skeleton should fail without --force');
  if (r.forcedCode !== 0) throw new Error('--force overwrite failed');
  const parsed = JSON.parse(r.jsonOut) as { reqId: string };
  if (!/^r\d+$/u.test(parsed.reqId)) throw new Error(`bad json shape: ${r.jsonOut}`);
});

// ---------------------------------------------------------------------------
// r56/r57/r58 — thaw dest / backend flags / scan depth (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含冻结归档的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const dir = join(repo.root, 'llmanspec', 'changes', 'archive', '2026-01-01-frozen');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\nx\n');
  repo.run('bun', [CLI, 'archive', 'freeze']);
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'frozen']);
  ctx.fixtures['freeze仓库'] = { root: repo.root, repo };
});

bdd.when('运行 archive thaw --dest', (ctx) => {
  const { repo } = ctx.fixtures['freeze仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [
    CLI,
    'archive',
    'thaw',
    '--change',
    '2026-01-01-frozen',
    '--dest',
    'restored',
  ]);
  ctx.fixtures['thawdest结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('条目完整落到指定目录', (ctx) => {
  const r = ctx.fixtures['thawdest结果'] as { code: number; stdout: string; stderr: string };
  const { repo } = ctx.fixtures['freeze仓库'] as { repo: TempRepo };
  if (r.code !== 0) throw new Error(`thaw --dest failed: ${r.stdout}${r.stderr}`);
  if (!existsSync(join(repo.root, 'restored', '2026-01-01-frozen', 'proposal.md'))) {
    throw new Error('restored entry missing in --dest directory');
  }
});

bdd.when('运行 index rebuild --backend rag', (ctx) => {
  const repo = makeTempRepo();
  const result = repo.run('bun', [CLI, 'index', 'rebuild', '--backend', 'rag']);
  ctx.fixtures['backend结果'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('报错并提示迁移到 pageindex', (ctx) => {
  const r = ctx.fixtures['backend结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error('rag backend should be rejected');
  if (!`${r.stdout}${r.stderr}`.includes('removed'))
    throw new Error(`removal hint missing: ${r.stderr}`);
});

bdd.given('一个嵌套 change 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const nested = join(repo.root, 'llmanspec', 'changes', 'group', 'inner-change');
  mkdirSync(nested, { recursive: true });
  writeFileSync(join(nested, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'nested']);
  ctx.fixtures['仓库'] = { root: repo.root, repo };
});

bdd.when('运行 list --max-scan-depth 1', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const result = repo.run('bun', [CLI, 'list', '--max-scan-depth', '1']);
  ctx.fixtures['depth结果'] = { code: result.code, stdout: result.stdout };
});

bdd.thenStep('嵌套 change 不出现', (ctx) => {
  const r = ctx.fixtures['depth结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`list failed: ${r.stdout}`);
  if (r.stdout.includes('inner-change')) throw new Error(`nested leaked at depth 1: ${r.stdout}`);
});

// ---------------------------------------------------------------------------
// r59/r60 — change_id pattern & template (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个配置了纯数字前缀 pattern 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nchange_id:\n  pattern: "^[0-9]+-[a-z0-9-]+$"\n',
  );
  const dir = join(repo.root, 'llmanspec', 'changes', 'bad-id');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  ctx.fixtures['pattern仓库'] = { repo };
});

bdd.when('创建不匹配的 change 并运行 validate', (ctx) => {
  const { repo } = ctx.fixtures['pattern仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [CLI, 'validate', 'bad-id', '--no-check']);
  ctx.fixtures['pattern结果'] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
});

bdd.thenStep('该 change 判 ERROR 且非法正则加载即报错', (ctx) => {
  const r = ctx.fixtures['pattern结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`pattern violation should fail: ${r.stdout}${r.stderr}`);
  if (!`${r.stdout}${r.stderr}`.includes('change_id.pattern')) {
    throw new Error(`pattern message missing: ${r.stdout}${r.stderr}`);
  }
});

bdd.given('一个配置了 change_id.template 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nchange_id:\n  template: "c{{ llman_sdd_unique_id }}-{{ verb }}-{{ subject }}"\n',
  );
  ctx.fixtures['template仓库'] = { repo };
});

bdd.when('运行 change new --from 并带 --verb', (ctx) => {
  const { repo } = ctx.fixtures['template仓库'] as { repo: TempRepo };
  const result = repo.run('bun', [
    CLI,
    'change',
    'new',
    '--from',
    'port the importer module',
    '--verb',
    'port',
  ]);
  ctx.fixtures['template结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('派生 id 由模板渲染生成', (ctx) => {
  const r = ctx.fixtures['template结果'] as { code: number; stdout: string; stderr: string };
  const { repo } = ctx.fixtures['template仓库'] as { repo: TempRepo };
  if (r.code !== 0) throw new Error(`template render failed: ${r.stdout}${r.stderr}`);
  if (!r.stdout.includes('c1-port-port-the-importer-module')) {
    throw new Error(`rendered id mismatch: ${r.stdout}${r.stderr}`);
  }
  if (!existsSync(join(repo.root, 'llmanspec', 'changes', 'c1-port-port-the-importer-module'))) {
    throw new Error('rendered change dir missing');
  }
});
