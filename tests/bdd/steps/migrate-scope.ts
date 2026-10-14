import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, makeTempRepo, type TempRepo } from './shared.ts';

interface StripFixture {
  repo: TempRepo;
  specRel: string;
}

function seedRepo(ctx: { fixtures: Record<string, unknown> }): void {
  const repo = makeTempRepo();
  const dir = join(repo.root, 'llmanspec', 'specs');
  mkdirSync(dir, { recursive: true });
  const rel = 'llmanspec/specs/legacy.feature';
  writeFileSync(
    join(repo.root, rel),
    '# capability: legacy\n# purpose: p\n# scope: src/\n# reviewed-through: c12\n\n功能: legacy\n\n  @req:r777\n  规则: 规则\n    描述\n',
  );
  repo.run('git', ['add', '-A']);
  repo.run('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'legacy headers']);
  ctx.fixtures['strip仓库'] = { repo, specRel: rel } satisfies StripFixture;
}

function runStrip(repo: TempRepo, extra: string[] = []): { code: number; stdout: string } {
  const result = repo.run('bun', [CLI, 'project', 'migrate', 'strip-legacy-headers', ...extra]);
  return { code: result.code, stdout: result.stdout };
}

bdd.given('一个 specs 含 # scope: 与 # reviewed-through: 头行的临时仓库', (ctx) => {
  seedRepo(ctx);
});

bdd.given(
  '一个 specs 含 # scope: 与 # reviewed-through: 与 # capability: 头行的临时仓库',
  (ctx) => {
    seedRepo(ctx);
  },
);

bdd.when('运行 project migrate strip-legacy-headers 后再次运行', (ctx) => {
  const { repo } = ctx.fixtures['strip仓库'] as StripFixture;
  const first = runStrip(repo);
  const second = runStrip(repo);
  ctx.fixtures['strip结果'] = { first, second };
});

bdd.thenStep('首次运行后三类头行不再出现且文件仍通过结构校验', (ctx) => {
  const { repo, specRel } = ctx.fixtures['strip仓库'] as StripFixture;
  const { first } = ctx.fixtures['strip结果'] as { first: { code: number; stdout: string } };
  if (first.code !== 0) throw new Error(`first strip failed:\n${first.stdout}`);
  const content = repo.run('cat', [specRel]).stdout;
  for (const line of content.split('\n')) {
    if (/^#\s*(scope|reviewed-through|capability):/u.test(line)) {
      throw new Error(`legacy header line survived: ${line}`);
    }
  }
  const validate = repo.run('bun', [CLI, 'validate', '--specs']);
  if (validate.code !== 0) {
    throw new Error(`specs must stay structurally valid:\n${validate.stdout}${validate.stderr}`);
  }
});

bdd.thenStep('第二次运行报告零改动', (ctx) => {
  const { second } = ctx.fixtures['strip结果'] as { second: { code: number; stdout: string } };
  if (second.code !== 0) throw new Error(`second strip failed:\n${second.stdout}`);
  if (!second.stdout.includes('strip-legacy-headers: 0 file(s), 0 line(s) removed')) {
    throw new Error(`second run must report zero changes:\n${second.stdout}`);
  }
});

bdd.given('一个 specs 含历史头行的临时仓库', (ctx) => {
  seedRepo(ctx);
});

bdd.when('运行 project migrate strip-legacy-headers --dry-run', (ctx) => {
  const { repo } = ctx.fixtures['strip仓库'] as StripFixture;
  const before = repo.run('cat', ['llmanspec/specs/legacy.feature']).stdout;
  const result = runStrip(repo, ['--dry-run']);
  const after = repo.run('cat', ['llmanspec/specs/legacy.feature']).stdout;
  ctx.fixtures['dryRun结果'] = { result, before, after };
});

bdd.thenStep('报告含将改动的文件且文件内容不变', (ctx) => {
  const { result, before, after } = ctx.fixtures['dryRun结果'] as {
    result: { code: number; stdout: string };
    before: string;
    after: string;
  };
  if (result.code !== 0) throw new Error(`dry-run failed:\n${result.stdout}`);
  if (!result.stdout.includes('llmanspec/specs/legacy.feature')) {
    throw new Error(`dry-run must name the affected file:\n${result.stdout}`);
  }
  if (!result.stdout.includes('(dry-run)')) {
    throw new Error(`dry-run must be marked:\n${result.stdout}`);
  }
  if (before !== after) throw new Error('dry-run must not write');
});

// r100 — 迁移手册 playbook 与未知版本对
bdd.given('一个已安装本 CLI 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  ctx.fixtures['playbook仓库'] = { repo, specRel: '' } satisfies StripFixture;
});

bdd.when(
  '运行 project migrate prompt --version-expr "0.7.5->0.8.0" 与 project migrate prompt --version-expr "9.9.9->9.9.10"',
  (ctx) => {
    const { repo } = ctx.fixtures['playbook仓库'] as StripFixture;
    const hit = repo.run('bun', [
      CLI,
      'project',
      'migrate',
      'prompt',
      '--version-expr',
      '0.7.5->0.8.0',
    ]);
    const miss = repo.run('bun', [
      CLI,
      'project',
      'migrate',
      'prompt',
      '--version-expr',
      '9.9.9->9.9.10',
    ]);
    ctx.fixtures['playbook结果'] = { hit, miss };
  },
);

bdd.thenStep('前者输出含 strip-legacy-headers 与 init --update 步骤及自检清单', (ctx) => {
  const { hit } = ctx.fixtures['playbook结果'] as {
    hit: { code: number; stdout: string };
  };
  if (hit.code !== 0) throw new Error(`playbook lookup failed:\n${hit.stdout}`);
  for (const needle of [
    'Migration playbook: 0.7.5->0.8.0',
    'strip-legacy-headers',
    'init --update',
    '## Verification checklist',
  ]) {
    if (!hit.stdout.includes(needle)) throw new Error(`playbook missing '${needle}'`);
  }
});

bdd.thenStep('后者报未知版本对且列出 0.7.5->0.8.0', (ctx) => {
  const { miss } = ctx.fixtures['playbook结果'] as {
    miss: { code: number; stdout: string; stderr: string };
  };
  if (miss.code === 0) throw new Error(`unknown migration must fail:\n${miss.stdout}`);
  const err = `${miss.stderr}${miss.stdout}`;
  if (!err.includes('unknown migration: 9.9.9->9.9.10') || !err.includes('0.7.5->0.8.0')) {
    throw new Error(`unknown-migration error must list known pairs:\n${err}`);
  }
});
