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

// r100 — 迁移手册 per-version 注册表与范围查询
interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runPrompt(repo: TempRepo, extra: string[]): RunResult {
  const r = repo.run('bun', [CLI, 'project', 'migrate', 'prompt', ...extra]);
  return { code: r.code, stdout: r.stdout, stderr: r.stderr };
}

bdd.given('一个已安装本 CLI 的临时仓库', (ctx) => {
  const repo = makeTempRepo();
  ctx.fixtures['playbook仓库'] = { repo, specRel: '' } satisfies StripFixture;
});

bdd.when('运行 project migrate prompt --from-version 0.7.5 --to-version 0.9.0', (ctx) => {
  const { repo } = ctx.fixtures['playbook仓库'] as StripFixture;
  ctx.fixtures['playbook结果'] = runPrompt(repo, [
    '--from-version',
    '0.7.5',
    '--to-version',
    '0.9.0',
  ]);
});

bdd.thenStep('输出依次含 0.8.0 与 0.9.0 版本头及各条目的编号步骤与自检清单', (ctx) => {
  const hit = ctx.fixtures['playbook结果'] as RunResult;
  if (hit.code !== 0) throw new Error(`playbook failed:\n${hit.stdout}${hit.stderr}`);
  for (const needle of [
    '# Migration playbook: 0.7.5 -> 0.9.0',
    '## 0.8.0',
    '## 0.9.0',
    '#### Steps',
    '#### Verification checklist',
    '- [ ] ',
  ]) {
    if (!hit.stdout.includes(needle)) throw new Error(`playbook missing '${needle}'`);
  }
  if (hit.stdout.indexOf('## 0.8.0') >= hit.stdout.indexOf('## 0.9.0')) {
    throw new Error('versions must render in ascending order');
  }
});

bdd.thenStep('版本间以水平分割线分隔', (ctx) => {
  const hit = ctx.fixtures['playbook结果'] as RunResult;
  const dividers = hit.stdout.match(/^---$/gm)?.length ?? 0;
  if (dividers !== 1)
    throw new Error(`expected exactly 1 divider between 2 versions:\n${hit.stdout}`);
});

bdd.when('运行 project migrate prompt --from-version 0.8.0 --to-version 0.9.0', (ctx) => {
  const { repo } = ctx.fixtures['playbook仓库'] as StripFixture;
  ctx.fixtures['playbook结果'] = runPrompt(repo, [
    '--from-version',
    '0.8.0',
    '--to-version',
    '0.9.0',
  ]);
});

bdd.thenStep('输出含 0.9.0 版本头且不含治理元数据退役条目', (ctx) => {
  const hit = ctx.fixtures['playbook结果'] as RunResult;
  if (hit.code !== 0) throw new Error(`playbook failed:\n${hit.stdout}${hit.stderr}`);
  if (!hit.stdout.includes('## 0.9.0')) throw new Error('0.9.0 section missing');
  if (hit.stdout.includes('## 0.8.0') || hit.stdout.includes('Governance metadata retirement')) {
    throw new Error('left-open bound violated: 0.8.0 must be excluded');
  }
});

bdd.when('运行 project migrate prompt --from-version 0.8.0 --to-version 0.8.2', (ctx) => {
  const { repo } = ctx.fixtures['playbook仓库'] as StripFixture;
  ctx.fixtures['playbook结果'] = runPrompt(repo, [
    '--from-version',
    '0.8.0',
    '--to-version',
    '0.8.2',
  ]);
});

bdd.thenStep('输出含无登记迁移提示且退出码为 0', (ctx) => {
  const hit = ctx.fixtures['playbook结果'] as RunResult;
  if (hit.code !== 0) {
    throw new Error(`empty range must not fail:\n${hit.stdout}${hit.stderr}`);
  }
  if (!hit.stdout.includes('No documented migrations for 0.8.0 -> 0.8.2.')) {
    throw new Error(`empty range must print the no-migrations notice:\n${hit.stdout}`);
  }
});

bdd.when('运行 prompt 携带非法版本格式与携带 from 大于 to 两例', (ctx) => {
  const { repo } = ctx.fixtures['playbook仓库'] as StripFixture;
  const malformed = runPrompt(repo, ['--from-version', '0.9', '--to-version', '0.9.0']);
  const reversed = runPrompt(repo, ['--from-version', '0.9.0', '--to-version', '0.8.2']);
  ctx.fixtures['playbook结果'] = { malformed, reversed };
});

bdd.thenStep('均报错且非法格式例的错误信息含 x.y.z 格式提示', (ctx) => {
  const { malformed, reversed } = ctx.fixtures['playbook结果'] as {
    malformed: RunResult;
    reversed: RunResult;
  };
  if (malformed.code === 0) throw new Error('malformed version must fail');
  if (!`${malformed.stderr}${malformed.stdout}`.includes('x.y.z')) {
    throw new Error(`malformed-version error must hint the x.y.z format:\n${malformed.stderr}`);
  }
  if (reversed.code === 0) throw new Error('reversed range must fail');
});

bdd.when(
  '运行 project migrate prompt --version-expr "0.7.5->0.8.0" 与其再同给 --from-version 0.7.5 一例',
  (ctx) => {
    const { repo } = ctx.fixtures['playbook仓库'] as StripFixture;
    const legacy = runPrompt(repo, ['--version-expr', '0.7.5->0.8.0']);
    const conflict = runPrompt(repo, ['--version-expr', '0.7.5->0.8.0', '--from-version', '0.7.5']);
    ctx.fixtures['playbook结果'] = { legacy, conflict };
  },
);

bdd.thenStep('前者输出 0.8.0 迁移手册且 stderr 含弃用 WARNING', (ctx) => {
  const { legacy } = ctx.fixtures['playbook结果'] as { legacy: RunResult };
  if (legacy.code !== 0) throw new Error(`deprecated expr must keep working:\n${legacy.stderr}`);
  if (!legacy.stdout.includes('## 0.8.0')) throw new Error('0.8.0 playbook missing');
  if (!legacy.stderr.includes('deprecated')) {
    throw new Error(`deprecation WARNING missing from stderr:\n${legacy.stderr}`);
  }
});

bdd.thenStep('后者报旗标冲突错', (ctx) => {
  const { conflict } = ctx.fixtures['playbook结果'] as { conflict: RunResult };
  if (conflict.code === 0) throw new Error('expr + new flags must conflict');
  if (!`${conflict.stderr}${conflict.stdout}`.includes('conflicts')) {
    throw new Error(`conflict error must name the conflict:\n${conflict.stderr}`);
  }
});
