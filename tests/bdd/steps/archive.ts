// Domain step definitions: change archive 能力 — 覆盖 r39/r40(change
// archive 门禁:未勾任务拦截与 seal-off close-out 提交)。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { bdd } from '../runner.ts';
import { CLI, type TempRepo, makeTempRepo, seedChange } from './shared.ts';

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
  seedChange(repo, id, { files: { 'tasks.md': '# Tasks\n- [x] done\n' }, commit: 'draft' });
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
  seedChange(repo, id, {
    files: { 'tasks.md': '# Tasks\n- [ ] pending-one\n- [x] ok\n' },
    commit: 'draft',
  });
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
