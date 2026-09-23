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
  ETHICS_KEYS,
  runInit,
  loadConfig,
  localeToGherkinLang,
  parseCapability,
  parseFeatureSource,
  SpecParseError,
  validateAllSpecs,
  type CapabilityDoc,
  type DiscoveryIo,
} from '@llman-sdd/core';

import { makeNodeIo } from '../../helpers/nodeIo.ts';
import { bdd } from '../runner.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const CLI = join(REPO_ROOT, 'apps', 'cli', 'src', 'main.ts');

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

bdd.given('本仓库的等价 config(zh-Hans 与 bdd 配置)', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-sdd-init-'));
  mkdirSync(join(root, 'llmanspec'), { recursive: true });
  writeFileSync(
    join(root, 'llmanspec', 'config.yaml'),
    'schema: spec-driven\nlocale: zh-Hans\n\nbdd:\n  run_command: "bun test tests/bdd"\n  bindings:\n    - kind: tags\n      tags: [executable]\n',
  );
  ctx.fixtures['init'] = { root };
});

bdd.when('渲染 propose skill 与 validation-hints 单元', (ctx) => {
  const zhRoot = (ctx.fixtures['init'] as { root: string }).root;
  runInit(
    makeNodeIo(zhRoot),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0' },
  );
  // en locale 渲染进独立临时目录,断言双 locale 同语义判据
  const enRoot = mkdtempSync(join(tmpdir(), 'llman-sdd-init-en-'));
  mkdirSync(join(enRoot, 'llmanspec'), { recursive: true });
  writeFileSync(join(enRoot, 'llmanspec', 'config.yaml'), 'schema: spec-driven\nlocale: en\n');
  runInit(
    makeNodeIo(enRoot),
    { exists: (p) => existsSync(p), readText: (p) => readFileSync(p, 'utf8') },
    { update: true, version: '0.1.0' },
  );
  ctx.fixtures['配对判据产物'] = {
    zh: readFileSync(join(zhRoot, '.agents', 'skills', 'llman-sdd-propose', 'SKILL.md'), 'utf8'),
    en: readFileSync(join(enRoot, '.agents', 'skills', 'llman-sdd-propose', 'SKILL.md'), 'utf8'),
  };
});

bdd.thenStep('产物含 @human/@executable 分流判据小节标识', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string; en: string };
  if (!r.zh.includes('@human/@executable 分流判据')) {
    throw new Error('zh-Hans propose render lacks the pairing-triage section');
  }
});

bdd.thenStep('zh-Hans 与 en 产物均含该判据', (ctx) => {
  const r = ctx.fixtures['配对判据产物'] as { zh: string; en: string };
  if (!r.zh.includes('MUST 落成 `@executable` 验收场景')) {
    throw new Error('zh-Hans render lacks the triage rule body');
  }
  if (!r.en.includes('@human/@executable triage')) {
    throw new Error('en propose render lacks the pairing-triage section');
  }
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

bdd.thenStep('signals 覆盖五种 kind', (ctx) => {
  const kinds = (ctx.fixtures['review'] as { kinds: Set<string> }).kinds;
  for (const kind of ['pending', 'unbound', 'stale', 'locked', 'validate']) {
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

bdd.thenStep('三类信号仅含该 capability 且 locked 与 validate 保持全局', (ctx) => {
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

bdd.when('运行 v2 的 config skills --json', (ctx) => {
  const { root } = ctx.fixtures['config工作区'] as ConfigFixture;
  const proc = spawnSync('bun', [CLI, 'config', 'skills', '--json'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['skillsjson'] = {
    code: proc.status ?? 0,
    out: proc.stdout ?? '',
    err: proc.stderr ?? '',
  };
});

bdd.thenStep('JSON 输出 {enabled, available} 且 --set 为未知选项', (ctx) => {
  const { root, original } = ctx.fixtures['config工作区'] as ConfigFixture;
  const r = ctx.fixtures['skillsjson'] as { code: number; out: string; err: string };
  if (r.code !== 0) throw new Error(`config skills --json failed: ${r.err}`);
  const parsed = JSON.parse(r.out) as { enabled: string[]; available: string[] };
  if (!Array.isArray(parsed.enabled) || parsed.available.length !== 6)
    throw new Error(`shape wrong: ${r.out}`);
  // v1 parity: --set/--unset are NOT part of the flag surface (clap rc=2).
  const set = spawnSync('bun', [CLI, 'config', 'skills', '--set', 'llman-sdd-validate'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (set.status !== 2)
    throw new Error(`--set must be an unknown option (rc=2), got ${set.status}`);
  const after = readFileSync(join(root, 'llmanspec', 'config.yaml'), 'utf8');
  if (after !== original) throw new Error('--set must not write config');
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

bdd.thenStep('退出码非零且按产物报阶段强制缺失(v1 语义)', (ctx) => {
  const r = ctx.fixtures['validate结果'] as { code: number; stdout: string; stderr: string };
  if (r.code === 0) throw new Error(`stage gate should fail: ${r.stdout}`);
  if (!`${r.stdout}${r.stderr}`.includes('Stage forced to')) {
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
  const proc = spawnSync('bun', [CLI, 'show', 'gated', '--output', 'human'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['show结果'] = {
    beforeCode: proc.status ?? 0,
    beforeOut: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.when('运行 show --output json', (ctx) => {
  const { root } = ctx.fixtures['show工作区'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'show', 'gated', '--output', 'json'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['showjson结果'] = {
    code: proc.status ?? 0,
    out: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
  };
});

bdd.when('补齐 What Changes 后再运行 show', (ctx) => {
  const { root } = ctx.fixtures['show工作区'] as { root: string };
  writeFileSync(
    join(root, 'llmanspec', 'changes', 'gated', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\nx\n## What Changes\ny\n',
  );
  const proc = spawnSync('bun', [CLI, 'show', 'gated', '--output', 'human'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['show后结果'] = { afterCode: proc.status ?? 1, afterOut: proc.stdout ?? '' };
});

bdd.thenStep('文本模式不设门且输出 Stage', (ctx) => {
  const r = ctx.fixtures['show结果'] as { beforeCode: number; beforeOut: string };
  // v1 parity: text/compact mode renders changes without Why/What Changes gates.
  if (r.beforeCode !== 0) throw new Error(`text show should render: ${r.beforeOut}`);
  if (!r.beforeOut.includes('Stage:')) throw new Error(`Stage line missing: ${r.beforeOut}`);
  if (!r.beforeOut.includes('Gates:')) throw new Error(`Gates trailer missing: ${r.beforeOut}`);
});

bdd.thenStep('--output json 受 What Changes 门拦截', (ctx) => {
  const r = ctx.fixtures['showjson结果'] as { code: number; out: string };
  if (r.code === 0) throw new Error(`json show should gate: ${r.out}`);
  if (!r.out.includes('What Changes'))
    throw new Error(`What Changes gate message missing: ${r.out}`);
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

bdd.when('运行 show --output human -r 1 与 show --output human,meta-only', (ctx) => {
  const { root } = ctx.fixtures['showspec工作区'] as { root: string };
  const req = spawnSync('bun', [CLI, 'show', 'multi', '--output', 'human', '-r', '1'], {
    cwd: root,
    encoding: 'utf8',
  });
  const meta = spawnSync('bun', [CLI, 'show', 'multi', '--output', 'human,meta-only'], {
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

bdd.thenStep('文本模式 -r 与 meta-only 均为全量渲染', (ctx) => {
  const r = ctx.fixtures['showspec结果'] as {
    reqOut: string;
    reqCode: number;
    metaOut: string;
    metaCode: number;
  };
  if (r.reqCode !== 0 || !r.reqOut.includes('规则一') || !r.reqOut.includes('规则二'))
    throw new Error(`-r must render the full spec in text (v1 parity): ${r.reqOut}`);
  if (r.metaCode !== 0 || !r.metaOut.includes('规则一') || !r.metaOut.includes('## Morphology'))
    throw new Error(`meta-only must render the full spec in text (v1 parity): ${r.metaOut}`);
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
  if (!`${r.stdout}${r.stderr}`.includes('no longer supported'))
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

// ---------------------------------------------------------------------------
// r61 — change id prefix resolution (acceptance)
// ---------------------------------------------------------------------------

interface PrefixShowResult {
  stdout: string;
  stderr: string;
  status: number;
}

bdd.given('一个含 c2805-update-todo 与 c2806-fix-bug 两个 change 的临时仓库', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-prefix-'));
  for (const id of ['c2805-update-todo', 'c2806-fix-bug']) {
    const dir = join(root, 'llmanspec', 'changes', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'proposal.md'),
      '---\ndepends_on: []\n---\n\n## Why\nx\n\n## What Changes\n- y\n',
    );
  }
  ctx.fixtures['prefix仓库'] = { root };
});

bdd.when('运行 show c2805', (ctx) => {
  const { root } = ctx.fixtures['prefix仓库'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'show', 'c2805', '--output', 'human'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['prefix结果'] = {
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
    status: proc.status ?? 1,
  };
});

bdd.thenStep('解析到 c2805-update-todo 且 stderr 含 prefix match 提示', (ctx) => {
  const r = ctx.fixtures['prefix结果'] as PrefixShowResult;
  if (r.status !== 0) throw new Error(`show c2805 failed: ${r.stderr}`);
  if (!r.stderr.includes("'c2805' -> 'c2805-update-todo' (prefix match)")) {
    throw new Error(`prefix match hint missing on stderr: ${r.stderr}`);
  }
  if (!r.stdout.includes('path: c2805-update-todo')) {
    throw new Error(`resolved id not used in output: ${r.stdout}`);
  }
});

// ---------------------------------------------------------------------------
// r62 — context index lazy refresh (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含 specs 但无 .context 索引的临时仓库', (ctx) => {
  const root = mkdtempSync(join(tmpdir(), 'llman-ctx-'));
  const specsDir = join(root, 'llmanspec', 'specs');
  mkdirSync(specsDir, { recursive: true });
  writeFileSync(
    join(specsDir, 'demo.feature'),
    '# language: zh-CN\n# capability: demo\n# purpose: p\n# scope: .\n\n功能: demo\n\n  @req:r1 @human\n  场景: 规则\n    - 系统 MUST x\n',
  );
  ctx.fixtures['ctx仓库'] = { root };
});

bdd.when('运行 context 查询', (ctx) => {
  const { root } = ctx.fixtures['ctx仓库'] as { root: string };
  const proc = spawnSync('bun', [CLI, 'context', '--paths', 'llmanspec/specs'], {
    cwd: root,
    encoding: 'utf8',
  });
  ctx.fixtures['ctx结果'] = { stdout: proc.stdout ?? '', status: proc.status ?? 1 };
});

bdd.thenStep('索引被自动重建且不因 missing 返回 unavailable', (ctx) => {
  const { root } = ctx.fixtures['ctx仓库'] as { root: string };
  const r = ctx.fixtures['ctx结果'] as { stdout: string; status: number };
  if (r.status !== 0) throw new Error(`context exited non-zero: ${r.stdout}`);
  if (!existsSync(join(root, 'llmanspec', '.context', 'pageindex', 'tree.json'))) {
    throw new Error('tree.json was not auto-rebuilt');
  }
  const parsed = JSON.parse(r.stdout) as { status?: { errorKind?: string } };
  if (parsed.status?.errorKind === 'index_rebuild_failed') {
    throw new Error(`unexpected rebuild failure: ${r.stdout}`);
  }
});

// r32 — INFO-level issue default filtering (acceptance)
// ---------------------------------------------------------------------------

bdd.given('一个含 pending 规则的有效 spec 工作区', (ctx) => {
  const repo = makeTempRepo();
  mkdirSync(join(repo.root, 'llmanspec', 'specs'), { recursive: true });
  // @human 规则无可执行验收覆盖 → 稳定产生一条 INFO 级 pending 提示,spec 仍 valid
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'auth.feature'),
    '# language: zh-CN\n# capability: auth\n# purpose: p\n# scope: llmanspec/\n\n功能: auth\n\n  @req:r2 @human\n  场景: 规则\n    - 系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  ctx.fixtures['info仓库'] = repo;
});

bdd.when('运行 validate --all --json 与 validate --all --json --include-info', (ctx) => {
  const repo = ctx.fixtures['info仓库'] as TempRepo;
  const def = repo.run('bun', [CLI, 'validate', '--all', '--json', '--no-check']);
  const full = repo.run('bun', [
    CLI,
    'validate',
    '--all',
    '--json',
    '--include-info',
    '--no-check',
  ]);
  ctx.fixtures['info两态'] = {
    def: { code: def.code, stdout: def.stdout },
    full: { code: full.code, stdout: full.stdout },
  };
});

interface InfoValidateRun {
  code: number;
  stdout: string;
}

bdd.thenStep('缺省输出不含 INFO 级 issue 且 include-info 输出含 INFO 级 issue', (ctx) => {
  const { def, full } = ctx.fixtures['info两态'] as {
    def: InfoValidateRun;
    full: InfoValidateRun;
  };
  const parse = (r: InfoValidateRun): { level: string; id: string }[] => {
    const d = JSON.parse(r.stdout) as {
      items: { id: string; issues: { level: string }[] }[];
    };
    return d.items.flatMap((i) => i.issues.map((issue) => ({ level: issue.level, id: i.id })));
  };
  const defIssues = parse(def);
  const fullIssues = parse(full);
  if (defIssues.some((i) => i.level === 'INFO')) {
    throw new Error(`default output must drop INFO issues: ${def.stdout}`);
  }
  if (!fullIssues.some((i) => i.level === 'INFO')) {
    throw new Error(`--include-info must keep INFO issues: ${full.stdout}`);
  }
});

bdd.thenStep('两次运行的 valid 判定与退出码一致', (ctx) => {
  const { def, full } = ctx.fixtures['info两态'] as {
    def: InfoValidateRun;
    full: InfoValidateRun;
  };
  const validOf = (r: InfoValidateRun): unknown =>
    (JSON.parse(r.stdout) as { items: { id: string; valid: boolean }[] }).items.map((i) => [
      i.id,
      i.valid,
    ]);
  if (JSON.stringify(validOf(def)) !== JSON.stringify(validOf(full))) {
    throw new Error('valid verdicts diverged between default and --include-info runs');
  }
  if (def.code !== full.code) {
    throw new Error(`exit codes diverged: ${def.code} vs ${full.code}`);
  }
});

// ---------------------------------------------------------------------------
// r21 — show json/spec + graph mermaid contract (acceptance)
// ---------------------------------------------------------------------------

interface ShowGraphResult {
  showJson: { code: number; stdout: string; stderr: string };
  showSpec: { code: number; stdout: string };
  graph: { code: number; stdout: string };
}

const SHOW_JSON_FIELDS = [
  'id',
  'path',
  'title',
  'stage',
  'artifacts',
  'readyToImplement',
  'specsLanded',
  'needsSpecsChange',
  'attached',
  'deltaCount',
  'gateChecks',
  'matchedViaPrefix',
] as const;

bdd.given('一个含活跃 change 与归档依赖的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const changes = join(repo.root, 'llmanspec', 'changes');
  mkdirSync(join(changes, 'archive', '2026-01-01-done-old'), { recursive: true });
  writeFileSync(
    join(changes, 'archive', '2026-01-01-done-old', 'proposal.md'),
    '---\ndepends_on: []\n---\n\n## Why\nx\n',
  );
  mkdirSync(join(changes, 'demo-change'), { recursive: true });
  writeFileSync(
    join(changes, 'demo-change', 'proposal.md'),
    '---\ndepends_on: [done-old]\n---\n\n## Why\nx\n\n## What Changes\ny\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'deps']);
  ctx.fixtures['showgraph仓库'] = { repo };
});

bdd.when('运行 show --output json 与 show spec 原文与 graph --format mermaid', (ctx) => {
  const repo = (ctx.fixtures['showgraph仓库'] as { repo: TempRepo }).repo;
  const json = repo.run('bun', [CLI, 'show', 'demo-change', '--output', 'json']);
  const spec = repo.run('bun', [CLI, 'show', 'sample', '--output', 'human']);
  const graph = repo.run('bun', [CLI, 'graph', '--format', 'mermaid']);
  ctx.fixtures['showgraph结果'] = {
    showJson: { code: json.code, stdout: json.stdout, stderr: json.stderr },
    showSpec: { code: spec.code, stdout: spec.stdout },
    graph: { code: graph.code, stdout: graph.stdout },
  } satisfies ShowGraphResult;
});

bdd.thenStep('show JSON 字段集完整覆盖 change 合同字段', (ctx) => {
  const r = ctx.fixtures['showgraph结果'] as ShowGraphResult;
  if (r.showJson.code !== 0) {
    throw new Error(`show --output json failed: ${r.showJson.stderr}`);
  }
  const parsed = JSON.parse(r.showJson.stdout) as Record<string, unknown>;
  const missing = SHOW_JSON_FIELDS.filter((f) => !(f in parsed));
  if (missing.length > 0) {
    throw new Error(`show json missing contract fields: ${missing.join(', ')}`);
  }
});

bdd.thenStep('show spec 直出头注释与 gherkin 原文', (ctx) => {
  const r = ctx.fixtures['showgraph结果'] as ShowGraphResult;
  if (r.showSpec.code !== 0) throw new Error(`show sample failed`);
  for (const marker of ['# language: zh-CN', '# capability: sample', '功能: sample', '场景: ok']) {
    if (!r.showSpec.stdout.includes(marker)) {
      throw new Error(`show spec output missing raw marker "${marker}":\n${r.showSpec.stdout}`);
    }
  }
});

bdd.thenStep('graph 以 flowchart TD 开头且节点下划线化并以 classDef archived 收尾', (ctx) => {
  const r = ctx.fixtures['showgraph结果'] as ShowGraphResult;
  if (r.graph.code !== 0) throw new Error(`graph failed`);
  if (r.graph.stdout.split('\n')[0]?.trim() !== 'flowchart TD') {
    throw new Error(`graph must start with flowchart TD:\n${r.graph.stdout}`);
  }
  for (const marker of [
    'demo_change["demo-change"]',
    'done_old["done-old ✓ done"]:::archived',
    'demo_change -->|depends on| done_old',
  ]) {
    if (!r.graph.stdout.includes(marker)) {
      throw new Error(`graph output missing "${marker}":\n${r.graph.stdout}`);
    }
  }
  const last = r.graph.stdout
    .split('\n')
    .reverse()
    .find((l) => l.trim() !== '');
  if (!last?.trim().startsWith('classDef archived')) {
    throw new Error(`graph must end with classDef archived, got: ${last}`);
  }
});

// ---------------------------------------------------------------------------
// r22 — spec helpers + project migrate three states (acceptance)
// ---------------------------------------------------------------------------

interface MigrateResult {
  skeletonCode: number;
  skeletonContent: string;
  nextReqId: string;
  bareOut: string;
  toonOut: string;
  flattenOut: string;
  unknownCode: number;
  unknownOut: string;
}

bdd.given('一个已初始化且含 r1 规则的临时仓库', (ctx) => {
  ctx.fixtures['migrate仓库'] = { repo: makeTempRepo() };
});

bdd.when('运行 spec skeleton 与 next-req-id 与 project migrate 三态', (ctx) => {
  const repo = (ctx.fixtures['migrate仓库'] as { repo: TempRepo }).repo;
  const skel = repo.run('bun', [CLI, 'spec', 'skeleton', 'capx']);
  const skeletonContent =
    skel.code === 0
      ? readFileSync(join(repo.root, 'llmanspec', 'specs', 'capx.feature'), 'utf8')
      : '';
  const next = repo.run('bun', [CLI, 'spec', 'next-req-id', '--json']);
  const bare = repo.run('bun', [CLI, 'project', 'migrate']);
  const toon = repo.run('bun', [CLI, 'project', 'migrate', '--kind', 'toon2features']);
  const flatten = repo.run('bun', [CLI, 'project', 'migrate', '--kind', 'specs-flatten']);
  const unknown = repo.run('bun', [CLI, 'project', 'migrate', '--kind', 'bogus']);
  let nextReqId = '';
  try {
    nextReqId = String((JSON.parse(next.stdout || '{}') as { reqId?: string }).reqId ?? '');
  } catch {
    // then-step reports the failure
  }
  ctx.fixtures['migrate结果'] = {
    skeletonCode: skel.code,
    skeletonContent,
    nextReqId,
    bareOut: bare.stdout,
    toonOut: toon.stdout,
    flattenOut: flatten.stdout,
    unknownCode: unknown.code,
    unknownOut: `${unknown.stdout}${unknown.stderr}`,
  } satisfies MigrateResult;
});

bdd.thenStep('skeleton 产物过单轨校验且 next-req-id 输出下一空闲 id', (ctx) => {
  const r = ctx.fixtures['migrate结果'] as MigrateResult;
  if (r.skeletonCode !== 0) throw new Error('spec skeleton failed');
  const doc = parseCapability(r.skeletonContent, 'capx.feature');
  if (doc.errors.length !== 0) {
    throw new Error(`skeleton fails single-track validation: ${JSON.stringify(doc.errors)}`);
  }
  // makeTempRepo 的 sample.feature 占 r1:skeleton 领走下一空闲 id r2,
  // 随后 next-req-id 扫描全局注册表应报再下一个空闲 id r3。
  if (!r.skeletonContent.includes('@req:r2 @human')) {
    throw new Error(`skeleton did not claim the next free id r2:\n${r.skeletonContent}`);
  }
  if (r.nextReqId !== 'r3') {
    throw new Error(`expected next free id r3, got "${r.nextReqId}"`);
  }
});

bdd.thenStep('migrate 裸调用输出总览且两种 kind 各输出协作说明', (ctx) => {
  const r = ctx.fixtures['migrate结果'] as MigrateResult;
  // 总览含两种 --kind 提示(输出文案随 config locale 变化,断言取语言中立标记)
  for (const marker of ['toon2features', 'specs-flatten']) {
    if (!r.bareOut.includes(marker)) {
      throw new Error(`bare migrate overview missing "${marker}":\n${r.bareOut}`);
    }
  }
  if (!r.toonOut.includes('spec.toon')) {
    throw new Error(`toon2features guidance missing:\n${r.toonOut}`);
  }
  if (!r.flattenOut.includes('git mv')) {
    throw new Error(`specs-flatten guidance missing:\n${r.flattenOut}`);
  }
});

bdd.thenStep('未知 --kind 退出码非零', (ctx) => {
  const r = ctx.fixtures['migrate结果'] as MigrateResult;
  if (r.unknownCode === 0) throw new Error(`unknown kind must exit non-zero: ${r.unknownOut}`);
  if (!r.unknownOut.includes('unknown migration kind')) {
    throw new Error(`unexpected error output: ${r.unknownOut}`);
  }
});

// ---------------------------------------------------------------------------
// r42 — spec add-scenario append success + missing-req zero side effect
// ---------------------------------------------------------------------------

interface AddScenarioResult {
  okCode: number;
  okOut: string;
  failCode: number;
  failOut: string;
  beforeFail: string;
  afterFail: string;
}

bdd.when('运行 spec add-scenario 指向存在的 req 与不存在的 req', (ctx) => {
  const { root } = ctx.fixtures['authoring工作区'] as { root: string };
  const run = (args: string[]): { code: number; out: string } => {
    const proc = spawnSync('bun', [CLI, ...args], { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, out: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
  };
  const ok = run([
    'spec',
    'add-scenario',
    'auth',
    'r1',
    '令牌验收',
    '--when',
    '访问受保护资源',
    '--then',
    '访问被允许',
  ]);
  const specPath = join(root, 'llmanspec', 'specs', 'auth.feature');
  const beforeFail = readFileSync(specPath, 'utf8');
  const fail = run([
    'spec',
    'add-scenario',
    'auth',
    'r99',
    '幽灵场景',
    '--when',
    '触发门',
    '--then',
    '门被拦截',
  ]);
  const afterFail = readFileSync(specPath, 'utf8');
  ctx.fixtures['addscenario结果'] = {
    okCode: ok.code,
    okOut: ok.out,
    failCode: fail.code,
    failOut: fail.out,
    beforeFail,
    afterFail,
  } satisfies AddScenarioResult;
});

bdd.thenStep('存在的 req 追加 @executable 验收场景且 given 缺省为空', (ctx) => {
  const r = ctx.fixtures['addscenario结果'] as AddScenarioResult;
  if (r.okCode !== 0) throw new Error(`add-scenario failed: ${r.okOut}`);
  if (!r.afterFail.includes('@req:r1 @executable')) {
    throw new Error(`acceptance scenario tag missing:\n${r.afterFail}`);
  }
  const doc = parseCapability(r.afterFail, 'auth.feature');
  const acc = doc.scenarios.find(
    (s) => s.classification === 'executable' && s.reqIds.includes('r1'),
  );
  if (!acc) throw new Error(`appended scenario not parseable:\n${r.afterFail}`);
  const kinds = acc.steps.map((s) => s.kind);
  if (JSON.stringify(kinds) !== JSON.stringify(['when', 'then'])) {
    throw new Error(`given must default to empty; got steps [${kinds.join(', ')}]`);
  }
});

bdd.thenStep('不存在的 req 报错且文件零副作用', (ctx) => {
  const r = ctx.fixtures['addscenario结果'] as AddScenarioResult;
  if (r.failCode === 0) throw new Error(`missing req must fail: ${r.failOut}`);
  if (!r.failOut.includes('r99')) {
    throw new Error(`error must name the missing req: ${r.failOut}`);
  }
  if (r.beforeFail !== r.afterFail) {
    throw new Error('failed add-scenario must not touch the spec file');
  }
});

// ---------------------------------------------------------------------------
// r7 — parse language fallback chain + locale mapping (acceptance)
// ---------------------------------------------------------------------------

interface LangParseResult {
  zhLang: string;
  zhFeatureName: string;
  enLang: string;
  bothFailedMessage: string | null;
}

const LANG_EN_SAMPLE = `Feature: en capability

  Scenario: rule
    Then system MUST x
`;

bdd.given('一个无语言头使用中文关键字的 feature 内容', (ctx) => {
  const zhOnly = `功能: 中文能力

  @req:r7 @human
  场景: 规则
    - 系统 MUST 提供兜底
`;
  ctx.fixtures['语言样本'] = {
    zhOnly,
    enOnly: LANG_EN_SAMPLE,
    garbage: 'not a feature at all',
  };
  return ctx.fixtures['语言样本'];
});

bdd.when('依次以 en 与 zh-CN 匹配器解析该内容', (ctx) => {
  const sample = ctx.fixtures['语言样本'] as { zhOnly: string; enOnly: string; garbage: string };
  const zh = parseFeatureSource(sample.zhOnly);
  const en = parseFeatureSource(sample.enOnly);
  let bothFailedMessage: string | null = null;
  try {
    parseFeatureSource(sample.garbage);
  } catch (error) {
    bothFailedMessage = error instanceof Error ? error.message : String(error);
    if (!(error instanceof SpecParseError)) {
      throw new Error(`expected SpecParseError, got: ${bothFailedMessage}`);
    }
  }
  ctx.fixtures['语言解析'] = {
    zhLang: zh.language,
    zhFeatureName: zh.doc.feature?.name ?? '',
    enLang: en.language,
    bothFailedMessage,
  } satisfies LangParseResult;
});

bdd.thenStep('en 起步失败回退 zh-CN 解析成功', (ctx) => {
  const r = ctx.fixtures['语言解析'] as LangParseResult;
  if (r.zhLang !== 'zh-CN') {
    throw new Error(`zh feature must resolve via zh-CN fallback, got ${r.zhLang}`);
  }
  if (r.zhFeatureName !== '中文能力') {
    throw new Error(`fallback parse produced wrong feature name: ${r.zhFeatureName}`);
  }
});

bdd.thenStep('纯 en 内容以 en 匹配器起步成功', (ctx) => {
  const r = ctx.fixtures['语言解析'] as LangParseResult;
  if (r.enLang !== 'en') {
    throw new Error(`en feature must parse under the en matcher, got ${r.enLang}`);
  }
});

bdd.thenStep('双匹配器均失败才报错', (ctx) => {
  const r = ctx.fixtures['语言解析'] as LangParseResult;
  if (r.bothFailedMessage === null) {
    throw new Error('garbage input must throw after both matchers fail');
  }
  if (!r.bothFailedMessage.includes('tried en, zh-CN')) {
    throw new Error(`error must report the fallback chain: ${r.bothFailedMessage}`);
  }
});

bdd.thenStep('locale zh-Hans 映射为 zh-CN 且其余透传', (ctx) => {
  if (localeToGherkinLang('zh-Hans') !== 'zh-CN') {
    throw new Error(`zh-Hans must map to zh-CN, got ${localeToGherkinLang('zh-Hans')}`);
  }
  if (localeToGherkinLang('en') !== 'en' || localeToGherkinLang('fr') !== 'fr') {
    throw new Error('non zh-Hans locales must pass through unchanged');
  }
});

// ---------------------------------------------------------------------------
// r8 — capability header comments reported item by item (acceptance)
// ---------------------------------------------------------------------------

const NO_HEADER_FEATURE = `功能: 裸能力

  @req:r8 @human
  场景: 规则
    - 系统 MUST 报告缺失
`;

bdd.given('一个缺失全部头注释的 feature 内容', (ctx) => {
  ctx.fixtures['feature'] = { 源文本: NO_HEADER_FEATURE };
});

bdd.thenStep('错误逐项报告三处缺失头注释', (ctx) => {
  const doc = (ctx.fixtures['解析结果'] as ParseResult | undefined)?.doc;
  const codes = doc?.errors.map((e) => e.code) ?? [];
  for (const key of ['capability', 'purpose', 'scope']) {
    if (!codes.includes(`missing-header:${key}`)) {
      throw new Error(`missing-header:${key} not reported; got [${codes.join(', ')}]`);
    }
  }
});

// ---------------------------------------------------------------------------
// r5 — config top-level field domain + unknown-key tolerance (acceptance)
// ---------------------------------------------------------------------------

const FULL_CONFIG = `schema: spec-driven
locale: zh-Hans
extra_skills:
  - llman-sdd-ff
archive:
  strict_defer: true
bdd:
  run_command: "bun test tests/bdd"
sdd:
  merge_method: squash
change_id:
  pattern: "^[a-z0-9][a-z0-9-]*$"
unknown_toplevel: tolerated
`;

bdd.given('一个含全部顶层字段与未知字段的 config 内容', (ctx) => {
  ctx.fixtures['config'] = { 源文本: FULL_CONFIG };
  return ctx.fixtures['config'];
});

bdd.thenStep('加载成功且未知字段宽松放行', (ctx) => {
  const result = ctx.fixtures['加载结果'] as { error: string | null } | undefined;
  if (!result) throw new Error('no 加载结果 — did the 当 step run?');
  if (result.error !== null) {
    throw new Error(`unknown fields must be tolerated, got:\n${result.error}`);
  }
  const source = String(field(ctx.fixtures['config'], '源文本') ?? '');
  const parsed = loadConfig(source);
  if (parsed.schema !== 'spec-driven') throw new Error('schema field must round-trip');
  if (parsed.locale !== 'zh-Hans') throw new Error('locale field must round-trip');
  if (parsed.sdd?.merge_method !== 'squash') throw new Error('sdd.merge_method must round-trip');
  if (parsed.change_id?.pattern === undefined) throw new Error('change_id.pattern must round-trip');
});

bdd.thenStep('schema 非法值报错', (ctx) => {
  let message: string | null = null;
  try {
    loadConfig('schema: bogus\n');
  } catch (error) {
    message = (error as Error).message;
  }
  if (message === null) throw new Error('schema: bogus must be rejected');
  if (!message.includes('schema')) {
    throw new Error(`error must name the schema field: ${message}`);
  }
});

// r11/r13/r63/r64/r65 — validation executable 化 HIGH 批 (acceptance).
// 全部走 CLI 子进程;When 步骤把 {code, stdout: stdout+stderr} 写入
// fixtures['命令结果'] 以复用 smoke 的「退出码为/stdout 符合正则」断言
// (human 模式的 FAIL/issue 行走 stderr,故合并捕获)。
// ---------------------------------------------------------------------------

interface ValidateRepoFixture {
  repo: TempRepo;
  id: string;
}

const gitCommit = ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm'];

/** Combined-output CLI run against a temp repo. */
function runCliCombined(repo: TempRepo, args: string[]): { code: number; stdout: string } {
  const r = repo.run('bun', [CLI, ...args]);
  return { code: r.code, stdout: `${r.stdout}${r.stderr}` };
}

const requireValidateRepo = (ctx: { fixtures: Record<string, unknown> }): ValidateRepoFixture => {
  const fixture = ctx.fixtures['验证仓库'] as ValidateRepoFixture | undefined;
  if (!fixture) throw new Error('no temp repo fixture — did the 假如 step run?');
  return fixture;
};

// r11 — seeded-defect report aggregation: FAIL/OK lines + Totals + exit code.
bdd.given('一个含种子缺陷 spec 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'broken.feature'),
    '# language: zh-CN\n# capability: broken\n# purpose: p\n# scope: llmanspec/\n\n功能: broken\n\n  @req:r11 @human @executable\n  场景: 互斥\n    - 系统 MUST x\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'seed defect']);
  ctx.fixtures['验证仓库'] = { repo, id: 'broken' } satisfies ValidateRepoFixture;
});

bdd.when('在该仓库运行 validate --specs --output human', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', '--specs', '--output', 'human']);
});

// r13 — redefined contract: --check/--no-check are v1-surface no-ops; the help
// text must describe the delegation reality instead of claiming harness runs.
bdd.given('一个含有效 specs 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  ctx.fixtures['验证仓库'] = { repo, id: 'sample' } satisfies ValidateRepoFixture;
});

bdd.when('分别以缺省、--check、--no-check 运行 validate --specs', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  const runs = [
    runCliCombined(repo, ['validate', '--specs']),
    runCliCombined(repo, ['validate', '--specs', '--check']),
    runCliCombined(repo, ['validate', '--specs', '--no-check']),
  ];
  ctx.fixtures['no-op三跑'] = runs;
  ctx.fixtures['命令结果'] = runs[runs.length - 1];
});

bdd.thenStep('三次运行的退出码与输出一致', (ctx) => {
  const runs = ctx.fixtures['no-op三跑'] as { code: number; stdout: string }[];
  const first = runs[0] as { code: number; stdout: string };
  for (const [i, r] of runs.entries()) {
    if (r.code !== first.code || r.stdout !== first.stdout) {
      throw new Error(
        `run ${i} diverged (code ${r.code} vs ${first.code}):\n${r.stdout}\n--- vs ---\n${first.stdout}`,
      );
    }
  }
});

bdd.when('运行 validate --help', (ctx) => {
  const { repo } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', '--help']);
});

bdd.thenStep('help 文案指向委托语义且不含执行 harness 宣称', (ctx) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes('no-op') || !out.includes('project test suite')) {
    throw new Error(
      `help text must state the delegation reality (no-op + project test suite):\n${out}`,
    );
  }
  if (/skip the bdd\.run_command check|run the bdd\.run_command check/u.test(out)) {
    throw new Error(`help text still claims validate executes the harness:\n${out}`);
  }
});

// r63 — completeness WARNING (full-not-landed, skill guidance) + workspace-level
// dirty live specs WARNING on the default branch. JSON mode is the observation
// seam: single-item human output stays silent for valid items, so the WARNING
// surface is read from items[].issues.
bdd.given('一个 stage=full 已绑定但 specs 未 landed 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  const id = 'demo-landed';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  writeFileSync(join(dir, 'design.md'), '# design\n');
  writeFileSync(join(dir, 'tasks.md'), '# Tasks\n- [x] done\n');
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.when('对该 change 运行 validate --json', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--json']);
});

const requireIssues = (ctx: {
  fixtures: Record<string, unknown>;
}): { level: string; path: string; message: string }[] => {
  const r = ctx.fixtures['命令结果'] as { stdout: string };
  const parsed = JSON.parse(r.stdout) as {
    items: { issues: { level: string; path: string; message: string }[] }[];
  };
  return parsed.items.flatMap((i) => i.issues);
};

bdd.thenStep('输出含 specs not landed WARNING 且带 llman-sdd-propose 引导', (ctx) => {
  const hit = requireIssues(ctx).find((x) => x.message.includes('specs not landed'));
  if (!hit) {
    throw new Error(`specs-not-landed WARNING missing:\n${JSON.stringify(requireIssues(ctx))}`);
  }
  if (hit.level !== 'WARNING') throw new Error(`expected WARNING, got ${hit.level}`);
  if (!hit.message.includes('llman-sdd-propose')) {
    throw new Error(`propose skill guidance missing:\n${hit.message}`);
  }
});

bdd.thenStep('不建议重跑 change start', (ctx) => {
  const hit = requireIssues(ctx).find((x) => x.message.includes('specs not landed'));
  if (!hit?.message.includes('do NOT re-run change start')) {
    throw new Error(`anti-guidance against re-running change start missing:\n${hit?.message}`);
  }
});

bdd.when('切回默认分支并弄脏 llmanspec/specs 后再次运行 validate', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  repo.run('git', ['switch', 'main']);
  const specPath = join(repo.root, 'llmanspec', 'specs', 'sample.feature');
  writeFileSync(specPath, `${readFileSync(specPath, 'utf8')}\n# dirty edit\n`);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

bdd.thenStep('输出含工作区级脏 specs WARNING', (ctx) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes('live specs dirty on default branch')) {
    throw new Error(`workspace-level dirty-specs WARNING missing:\n${out}`);
  }
});

// r64 — proposal frontmatter legal-field gate.
bdd.given('一个 proposal frontmatter 含未知字段 "{field}" 的临时仓库', (ctx, field) => {
  const repo = makeTempRepo();
  const id = 'demo-fm';
  const dir = join(repo.root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'proposal.md'),
    `---\ndepends_on: []\n${field}: draft\n---\n\n## Why\nx\n`,
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'draft']);
  ctx.fixtures['验证仓库'] = { repo, id } satisfies ValidateRepoFixture;
});

bdd.when('对该 change 运行 validate --output human', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

bdd.thenStep('输出含未知字段 "{field}" 与合法字段集提示', (ctx, field) => {
  const out = (ctx.fixtures['命令结果'] as { stdout: string }).stdout;
  if (!out.includes(`unknown field '${field}'`)) {
    throw new Error(`unknown-field message for '${field}' missing:\n${out}`);
  }
  if (!out.includes('depends_on, blocks, branch, base_branch, base_sha, needs_specs_change')) {
    throw new Error(`allowed-field set missing from message:\n${out}`);
  }
});

bdd.when('把 frontmatter 改写为六个合法字段后再次运行 validate', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  writeFileSync(
    join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'),
    '---\ndepends_on: []\nblocks: []\nbranch: sdd/demo-fm\nbase_branch: main\nbase_sha: abc\nneeds_specs_change: false\n---\n\n## Why\nx\n',
  );
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--output', 'human']);
});

// r65 — orphan acceptance scenario WARNING with `<cap>/acceptance/<name>` path.
bdd.given('一个含孤儿验收场景的 spec 临时仓库', (ctx) => {
  const repo = makeTempRepo();
  // r91: makeTempRepo 的 sample.feature 已占用 r1 — req_id 全局唯一,撞号会误触
  // 重复 ERROR 使 spec 失真,r65 只观察孤儿 WARNING。
  writeFileSync(
    join(repo.root, 'llmanspec', 'specs', 'orph.feature'),
    '# language: zh-CN\n# capability: orph\n# purpose: p\n# scope: llmanspec/\n\n功能: orph\n\n  @req:r91 @human\n  场景: 规则\n    - 系统 MUST x\n\n  @executable\n  场景: 孤儿验收\n    假如 前置\n    当 动作\n    那么 结果\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', [...gitCommit, 'orphan']);
  ctx.fixtures['验证仓库'] = { repo, id: 'orph' } satisfies ValidateRepoFixture;
});

bdd.when('对该 spec 运行 validate --json', (ctx) => {
  const { repo, id } = requireValidateRepo(ctx);
  ctx.fixtures['命令结果'] = runCliCombined(repo, ['validate', id, '--json']);
});

bdd.thenStep('孤儿验收 WARNING 的 path 为 "{path}"', (ctx, path) => {
  const r = ctx.fixtures['命令结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`validate --json failed: ${r.stdout}`);
  const parsed = JSON.parse(r.stdout) as {
    items: { id: string; issues: { level: string; path: string }[] }[];
  };
  const hit = parsed.items.flatMap((i) => i.issues).find((x) => x.path === path);
  if (!hit) throw new Error(`no issue with path '${path}' in:\n${r.stdout}`);
  if (hit.level !== 'WARNING') throw new Error(`expected WARNING at '${path}', got ${hit.level}`);
});

// ---------------------------------------------------------------------------
// r16 — default branch local-first resolution: main → master → origin/HEAD →
// origin/* matrix via `change start`'s recorded base_branch, plus the
// all-missing error. Each phase gets a fresh repo (layout cannot be mutated
// in place: refs are cheap, re-init is honest).
// ---------------------------------------------------------------------------

interface LayoutRepoFixture {
  repo: TempRepo;
  id: string;
}

const LAYOUT_BRANCH: Record<string, string> = {
  'main+master': 'main',
  'master-only': 'master',
  'origin-head': 'devel',
  'origin-branch': 'zside',
  none: 'trunk',
};

function makeLayoutRepo(layout: string): TempRepo {
  const branch = LAYOUT_BRANCH[layout];
  if (branch === undefined) throw new Error(`unknown layout: ${layout}`);
  const root = mkdtempSync(join(tmpdir(), 'llman-baselayout-'));
  const gitRun = (args: string[]): { code: number; stdout: string; stderr: string } => {
    const proc = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
  };
  gitRun(['init', '-q', '-b', branch]);
  gitRun(['config', 'user.email', 't@t']);
  gitRun(['config', 'user.name', 't']);
  mkdirSync(join(root, 'llmanspec', 'specs'), { recursive: true });
  writeFileSync(join(root, 'llmanspec', 'config.yaml'), 'schema: spec-driven\n');
  writeFileSync(
    join(root, 'llmanspec', 'specs', 'sample.feature'),
    '# language: zh-CN\n# capability: sample\n# purpose: p\n# scope: llmanspec/\n\n功能: sample\n\n  @req:r1 @human\n  场景: ok\n    - 系统 MUST x\n',
  );
  const id = 'demo-base';
  const dir = join(root, 'llmanspec', 'changes', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'proposal.md'), '---\ndepends_on: []\n---\n\n## Why\nx\n');
  gitRun(['add', '-A']);
  gitRun(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  if (layout === 'main+master') gitRun(['branch', 'master']);
  if (layout === 'origin-head') {
    gitRun(['update-ref', 'refs/remotes/origin/devel', 'HEAD']);
    gitRun(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/devel']);
  }
  if (layout === 'origin-branch') {
    gitRun(['update-ref', 'refs/remotes/origin/zside', 'HEAD']);
  }
  return {
    root,
    run: (cmd, args) => {
      const proc = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
      return { code: proc.status ?? 1, stdout: proc.stdout ?? '', stderr: proc.stderr ?? '' };
    },
  };
}

bdd.given('一个默认分支布局为 {layout} 的临时仓库', (ctx, layout) => {
  ctx.fixtures['布局仓库'] = { repo: makeLayoutRepo(layout), id: 'demo-base' };
});

bdd.when('运行 change start', (ctx) => {
  const { repo, id } = ctx.fixtures['布局仓库'] as LayoutRepoFixture;
  const result = repo.run('bun', [CLI, 'change', 'start', id]);
  ctx.fixtures['start结果'] = {
    code: result.code,
    stdout: `${result.stdout}${result.stderr}`,
  };
});

bdd.thenStep('base_branch 记录为 {branch}', (ctx, branch) => {
  const { repo, id } = ctx.fixtures['布局仓库'] as LayoutRepoFixture;
  const r = ctx.fixtures['start结果'] as { code: number; stdout: string };
  if (r.code !== 0) throw new Error(`change start failed (expected base ${branch}): ${r.stdout}`);
  const proposal = readFileSync(join(repo.root, 'llmanspec', 'changes', id, 'proposal.md'), 'utf8');
  if (!proposal.includes(`base_branch: ${branch}`)) {
    throw new Error(`expected base_branch: ${branch} in:\n${proposal}`);
  }
});

bdd.thenStep('报错提示缺少默认分支', (ctx) => {
  const r = ctx.fixtures['start结果'] as { code: number; stdout: string };
  if (r.code === 0) {
    throw new Error(`change start should fail without any default branch: ${r.stdout}`);
  }
  if (!r.stdout.includes('no local main/master or origin')) {
    throw new Error(`default-branch-missing message missing: ${r.stdout}`);
  }
});
