import { readBinding } from '../change/frontmatter.ts';
import { CHANGES_DIR } from '../change/lifecycle.ts';
import { defaultBranch, isCleanTree, currentBranch, makeSpawnGit } from '../git/spawnGit.ts';
import { discoverSpecs, type DiscoveryIo } from '../validation/discover.ts';
/**
 * show change JSON (peripheral-commands capability, r21): v1 field set and
 * gate structure (clean-tree / on-bound-branch / stage-complete /
 * specs-landed / tasks-done / validate). Object keys are inserted in v1's
 * order; consumers compare structurally.
 */
import { validateAllSpecs } from '../validation/validate.ts';
import { stageFor, type ChangeFsIo } from './collect.ts';

export interface ShowFsIo extends ChangeFsIo {
  readText(path: string): string;
}

export interface ShowDeps {
  io: ShowFsIo;
  discovery: DiscoveryIo;
  root: string;
  specsDir: string;
  now: Date;
}

function parseTasks(md: string): { completed: number; total: number } {
  let completed = 0;
  let total = 0;
  for (const line of md.split('\n')) {
    const m = line.match(/^\s*-\s+\[( |x|X)\]/u);
    if (m) {
      total += 1;
      if (m[1] !== ' ') completed += 1;
    }
  }
  return { completed, total };
}

function existsSyncLike(deps: ShowDeps, p: string): boolean {
  return deps.io.exists(p) || deps.discovery.exists(p);
}

export function showChangeJson(deps: ShowDeps, id: string): Record<string, unknown> {
  const { io, discovery, root, now } = deps;
  const dir = `${root}/${CHANGES_DIR}/${id}`;
  const proposalPath = `${dir}/proposal.md`;
  if (!io.exists(proposalPath)) throw new Error(`change not found: ${id}`);

  const proposal = io.readText(proposalPath);
  const titleMatch = proposal.match(/^#\s+(.*)$/mu);
  const hasDesign = io.exists(`${dir}/design.md`);
  const hasTasks = io.exists(`${dir}/tasks.md`);
  const binding = readBinding(proposal);
  const stage = stageFor(hasDesign, hasTasks, binding !== null);

  const artifacts = ['proposal.md', 'design.md', 'tasks.md'].filter((f) =>
    io.exists(`${dir}/${f}`),
  );
  const { completed, total } = hasTasks
    ? parseTasks(io.readText(`${dir}/tasks.md`))
    : { completed: 0, total: 0 };

  const git = makeSpawnGit(root);
  const cleanTree = isCleanTree(git);
  const onDefault = currentBranch(git) === defaultBranch(git);
  const onBoundBranch = binding !== null && currentBranch(git) === binding.branch;

  // specs landing: bound changes must have touched llmanspec/specs/ since base
  let specsLanded = false;
  if (binding !== null) {
    const touched =
      git.runOpt(['diff', '--name-only', `${binding.baseBranch}...${binding.branch}`]) ?? '';
    specsLanded = touched.includes('llmanspec/specs/');
  }
  // needs_specs_change is an explicit frontmatter declaration (default true)
  const fmMatch = proposal.match(/^---\n([\s\S]*?)\n---/u);
  const declaredNeeds = fmMatch?.[1]?.match(/^needs_specs_change:\s*(true|false)\s*$/mu)?.[1];
  const needsSpecsChange = declaredNeeds !== undefined ? declaredNeeds === 'true' : true;

  const tasksDone = total > 0 && completed >= total;
  const specReport = validateAllSpecs(discoverSpecs(deps.specsDir, discovery), {
    exists: (p: string) => existsSyncLike(deps, p),
  });
  const validateOk = !specReport.failed && (total === 0 || tasksDone);

  const stageComplete = stage === 'full';

  const gateChecks = [
    {
      name: 'clean-tree',
      pass: cleanTree,
      hint: cleanTree ? '' : 'commit/stash before change start',
    },
    {
      name: 'on-bound-branch',
      pass: onBoundBranch || (binding === null && onDefault),
      hint: onBoundBranch ? '' : 'change is not attached; run `llman sdd change start <id>`',
    },
    {
      name: 'stage-complete',
      pass: stageComplete,
      hint: stageComplete ? '' : `add ${!hasDesign ? 'design.md' : 'tasks.md'} (current: ${stage})`,
    },
    {
      name: 'specs-landed',
      pass: specsLanded,
      hint: specsLanded
        ? ''
        : 'edit live specs on the bound branch and commit (or needs_specs_change: false)',
    },
    {
      name: 'tasks-done',
      pass: tasksDone,
      hint: tasksDone ? '' : `${total - completed} unchecked tasks`,
    },
    {
      name: 'validate',
      pass: validateOk,
      hint: validateOk ? '' : 'fix issues reported by `llman sdd validate <id> --strict`',
    },
  ];
  void now;

  return {
    id,
    path: id,
    title: titleMatch?.[1]?.trim() ?? '',
    stage,
    artifacts,
    readyToImplement: gateChecks.every((g) => g.pass),
    specsLanded,
    needsSpecsChange,
    attached: binding !== null,
    deltaCount: 0,
    deltas: [] as string[],
    gateChecks,
    matchedViaPrefix: false,
  };
}
