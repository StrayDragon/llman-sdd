import { readBinding } from '../change/frontmatter.ts';
import { CHANGES_DIR } from '../change/lifecycle.ts';
import { currentBranch, isCleanTree, type GitLike } from '../git/spawnGit.ts';
import { discoverSpecs } from '../validation/discover.ts';
/**
 * show change JSON (peripheral-commands capability, r21): v1 field set and
 * gate structure (clean-tree / on-bound-branch / stage-complete /
 * specs-landed / tasks-done / validate). Object keys are inserted in v1's
 * order; consumers compare structurally. Effects flow through the injected
 * FsIo and GitLike ports — this module stays pure.
 */
import { validateAllSpecs } from '../validation/validate.ts';
import { countTasks, firstH1, stageFor, type ChangeFsIo } from './collect.ts';

export type ShowFsIo = ChangeFsIo;

export interface ShowDeps {
  /** Single IO for change docs, tasks, and spec scope checks. */
  io: ShowFsIo;
  git: GitLike;
  root: string;
  specsDir: string;
}

export function showChangeJson(deps: ShowDeps, id: string): Record<string, unknown> {
  const { io, git, root } = deps;
  const dir = `${root}/${CHANGES_DIR}/${id}`;
  const proposalPath = `${dir}/proposal.md`;
  if (!io.exists(proposalPath)) throw new Error(`change not found: ${id}`);

  const proposal = io.readText(proposalPath);
  const hasDesign = io.exists(`${dir}/design.md`);
  const hasTasks = io.exists(`${dir}/tasks.md`);
  const binding = readBinding(proposal);
  const stage = stageFor(hasDesign, hasTasks, binding !== null);

  const artifacts = ['proposal.md', 'design.md', 'tasks.md'].filter((f) =>
    io.exists(`${dir}/${f}`),
  );
  const { completed, total } = hasTasks
    ? countTasks(io.readText(`${dir}/tasks.md`))
    : { completed: 0, total: 0 };

  const cleanTree = isCleanTree(git);
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
  const specReport = validateAllSpecs(discoverSpecs(deps.specsDir, io), io);
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
      pass: onBoundBranch,
      hint: onBoundBranch ? '' : 'change is not attached; run `llman-sdd change start <id>`',
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
      hint: validateOk ? '' : 'fix issues reported by `llman-sdd validate <id> --strict`',
    },
  ];

  return {
    id,
    path: id,
    title: firstH1(proposal),
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
