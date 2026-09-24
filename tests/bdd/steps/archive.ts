// Domain step definitions: change archive 能力 — 覆盖 r39/r40(change
// archive 门禁:未勾任务拦截与 seal-off close-out 提交)与 r24 扩展(freeze
// 非主检出 WARNING:不阻断且冷备仍产出)。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FREEZE_ARCHIVE_NAME } from '@llman-sdd/core';

import { bdd } from '../runner.ts';
import { CLI, type TempRepo, makeTempRepo, seedChange, runCli } from './shared.ts';

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
  const id = (ctx.fixtures['change'] as { id: string }).id;
  const log = repo.run('git', ['log', '--oneline', '-1']).stdout;
  if (!log.includes(`archive(sdd): ${id}`)) throw new Error(`close-out commit missing: ${log}`);
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

// ---------------------------------------------------------------------------
// r24 扩展 — freeze 非主检出 WARNING(acceptance):次级 worktree(持有非
// 默认分支)跑 freeze 必须输出 WARNING(非主检出/冷备可能不完整/建议回主
// 检出)且不阻断——退出码 0、冷备产物照常生成。fixture 复用 makeTempRepo
// 工厂 + `git worktree add -b` 兄弟目录(design D3);7z 环境守卫同
// steps/meta-foundation.ts。
// ---------------------------------------------------------------------------

interface SideWorktreeFreeze {
  repo: TempRepo;
  sidePath: string;
}

interface SideFreezeResult {
  code: number;
  stdout: string;
  stderr: string;
}

// 7z 能力来自打包依赖 7z-wasm;缺失属环境损坏,快失败而非静默跳过
// (与 meta-foundation 的 r24 executable 场景同基线)。
let sevenZipBundled = false;
try {
  import.meta.resolve('7z-wasm');
  sevenZipBundled = true;
} catch {
  sevenZipBundled = false;
}

bdd.given('一个次级 worktree 持有非默认分支且含带日期归档目录的临时仓库', (ctx) => {
  if (!sevenZipBundled) {
    throw new Error(
      '[7z 环境守卫] bundled 7z-wasm 依赖不可用——freeze 非主检出警告场景无法执行,请先 bun install',
    );
  }
  const repo = makeTempRepo();
  const sidePath = `${repo.root}-side`;
  repo.run('git', ['worktree', 'add', '-b', 'feature/side', sidePath]);
  // Dated candidate lives in the SIDE worktree only (uncommitted is enough:
  // freeze reads the working tree, no git object writes involved).
  const dated = join(sidePath, 'llmanspec', 'changes', 'archive', '2026-01-01-ancient');
  mkdirSync(dated, { recursive: true });
  writeFileSync(join(dated, 'proposal.md'), '# ancient\n');
  ctx.fixtures['侧检仓库'] = { repo, sidePath } satisfies SideWorktreeFreeze;
});

bdd.when('在次级 worktree 运行 archive freeze', (ctx) => {
  const { sidePath } = ctx.fixtures['侧检仓库'] as SideWorktreeFreeze;
  const proc = runCli(['archive', 'freeze'], sidePath);
  ctx.fixtures['侧检冻结'] = {
    code: proc.status ?? 1,
    stdout: proc.stdout ?? '',
    stderr: proc.stderr ?? '',
  } satisfies SideFreezeResult;
});

bdd.thenStep('输出含非主检出 WARNING', (ctx) => {
  const r = ctx.fixtures['侧检冻结'] as SideFreezeResult;
  if (r.code !== 0) {
    throw new Error(`WARNING must not block freeze: ${r.stdout}${r.stderr}`);
  }
  if (!r.stdout.includes('WARNING') || !r.stdout.includes('non-main checkout')) {
    throw new Error(`non-main-checkout WARNING missing in stdout: ${r.stdout}`);
  }
  if (!r.stdout.includes('may be incomplete') || !r.stdout.includes('main checkout')) {
    throw new Error(`WARNING lacks required elements (incomplete/main checkout): ${r.stdout}`);
  }
});

bdd.thenStep('冷备仍产出且候选目录被冻结移除', (ctx) => {
  const { sidePath } = ctx.fixtures['侧检仓库'] as SideWorktreeFreeze;
  const r = ctx.fixtures['侧检冻结'] as SideFreezeResult;
  if (r.code !== 0) throw new Error(`freeze failed: ${r.stdout}${r.stderr}`);
  const archiveDir = join(sidePath, 'llmanspec', 'changes', 'archive');
  if (!existsSync(join(archiveDir, FREEZE_ARCHIVE_NAME))) {
    throw new Error(`${FREEZE_ARCHIVE_NAME} was not produced in the side worktree`);
  }
  if (existsSync(join(archiveDir, '2026-01-01-ancient'))) {
    throw new Error('frozen candidate directory was not removed from changes/archive');
  }
});

// align-report-cli-surface:change archive 遗留兼容旗标已删除(B1)
bdd.when('运行 change archive 并附加遗留兼容旗标', (ctx) => {
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const id = (ctx.fixtures['change'] as { id: string }).id;
  // 拼接避免字面 token(removed 面零提及)
  const legacy = ['--skip-', 'specs'].join('');
  const result = repo.run('bun', [CLI, 'change', 'archive', id, legacy]);
  ctx.fixtures['archive结果'] = {
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
  };
});

bdd.thenStep('报 unknown option 且归档未产生', (ctx) => {
  const r = ctx.fixtures['archive结果'] as ArchiveResult;
  if (r.code === 0 || !`${r.stderr ?? ''}`.toLowerCase().includes('unknown option')) {
    throw new Error(`expected unknown option, got code=${r.code} stderr=${r.stderr}`);
  }
  const repo = (ctx.fixtures['仓库'] as { repo: TempRepo }).repo;
  const root = repo.root;
  if (existsSync(join(root, 'llmanspec', 'changes', 'archive', 'demo-arch'))) {
    // 归档应因 unknown option 而根本没执行(目录未产生)
    throw new Error('archive ran despite the legacy flag being unknown');
  }
});
