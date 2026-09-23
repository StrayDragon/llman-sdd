// 版本 SSOT 是包描述文件(发布产物)/git tag(二进制,经 LLMAN_SDD_VERSION 注入)。
// 运行时从所在包的 package.json 读取,避免双处维护。单文件二进制内
// import.meta.url 指向 $bunfs 虚拟路径,package.json 不存在——此处必须容错,
// 版本由构建期 define 注入,回退值不会对外暴露。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
    ) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}
export const VERSION = readPackageVersion();

export * from './ports.ts';

export {
  EXTRA_SKILLS,
  archiveSchema,
  bddSchema,
  bindingSchema,
  changeIdSchema,
  scenarioAttrsBindingSchema,
  sddConfigSchema,
  sddSchema,
  tagsBindingSchema,
  type SddConfig,
  type SddConfigInput,
} from './config/schema.ts';
export { ConfigValidationError, MAX_REPORTED_ISSUES, loadConfig } from './config/load.ts';
export {
  ChangeIdError,
  compileChangeIdPattern,
  nextUniqueNumber,
  renderChangeIdTemplate,
} from './config/changeId.ts';
export {
  ExtraSkillsError,
  renderConfigOverview,
  setExtraSkills,
  skillsJson,
} from './config/surface.ts';

export type {
  CapabilityDoc,
  CapabilityHeader,
  ScenarioClassification,
  ScenarioIR,
  SpecStructuralError,
} from './spec/ir.ts';
export { specIdOf } from './spec/ir.ts';
export {
  SpecParseError,
  localeToGherkinLang,
  parseCapability,
  parseFeatureSource,
} from './spec/parser.ts';
export { buildReqRegistry, type ReqRegistry, type RegistryDuplicate } from './spec/reqRegistry.ts';
export {
  MIGRATE_KINDS,
  isMigrateKind,
  migrateNoteFor,
  migrateOverviewFor,
  type MigrateKind,
} from './project/migrateNotes.ts';
export {
  addReq,
  addScenario,
  AuthoringError,
  planDedupe,
  resolveReq,
  type DedupePlanItem,
  type ResolvedReq,
} from './spec/authoring.ts';
export type {
  SpecEntry,
  SpecIo,
  SpecVerdict,
  ValidationItem,
  ValidationLevel,
  ValidationReport,
} from './validation/validate.ts';
export { validateAllSpecs, validateCapability, applyStrict } from './validation/validate.ts';
export { buildDuplicatesFor, formatTotals } from './validation/validate.ts';
export { splitVerb } from './config/changeId.ts';
export {
  evaluateStaleness,
  notApplicableStaleness,
  type StalenessInfo,
} from './validation/staleness.ts';
export {
  checkChangeDoc,
  validateChange,
  STAGE_ORDER,
  type ChangeCheckConfig,
  type ChangeCheckInput,
  type ChangeCheckResult,
  type ChangeIssue,
  type ChangeFsIoLite,
  type StageGate,
} from './validation/changeCheck.ts';
export { discoverSpecs, type DiscoveryIo } from './validation/discover.ts';
export type { ChangeBinding } from './change/frontmatter.ts';
export { readBinding, writeBinding } from './change/frontmatter.ts';
export {
  GitError,
  defaultBranch,
  isCleanTree,
  makeSpawnGit,
  currentBranch,
  worktreeList,
  probeMainCheckout,
  nonMainCheckoutWarning,
  type GitLike,
  type WorktreeEntry,
  type MainCheckoutProbe,
} from './git/spawnGit.ts';
export { DRAFT_PROPOSAL_TEMPLATE, deriveChangeId } from './change/id.ts';
export { parseTaskCheckboxes, type ParsedTaskCheckboxes } from './change/tasks.ts';
export {
  extractUniqueNumber,
  collectNumbers,
  harvestUniqueNumbers,
  harvestAcrossWorktrees,
} from './change/nextId.ts';
export { ChangeIdResolveError, resolveChangeId, type ResolvedChangeId } from './change/resolve.ts';
export {
  CHANGES_DIR,
  LifecycleError,
  attachChange,
  changeDiff,
  finalizeChange,
  newChange,
  startChange,
  type FinalizeResult,
  type FsIo,
  archiveChange,
  archiveTaskGate,
  changeDiffInfo,
} from './change/lifecycle.ts';
export { normalizeLocale, localeFallbacks } from './templates/locale.ts';
export {
  MAX_UNIT_NESTING_DEPTH,
  renderTemplate,
  renderWithUnits,
  type UnitRegistry,
} from './templates/engine.ts';
export {
  ETHICS_KEYS,
  buildTemplateVars,
  effectiveRunCommand,
  enforceEthicsGovernance,
  loadLocaleResource,
  loadSkillTemplates,
  loadUnitRegistry,
  skillCandidates,
  type SkillTemplate,
  type TemplateIo,
} from './templates/skills.ts';
export {
  embeddedTemplates,
  makeEmbeddedTemplateIo,
  resolveEmbeddedTable,
  templateKeyFor,
} from './templates/embedded.ts';
export {
  TEMPLATES_ROOT,
  runInit,
  updateFileWithMarkers,
  type InitIo,
  type InitResult,
} from './init/init.ts';
export {
  collectChanges,
  renderChangesJson,
  renderChangesList,
  statusFor,
  stageFor,
  type ChangeFsIo,
  type ChangeStatus,
  type ChangeSummary,
} from './report/collect.ts';
export { graphData, graphMermaid, type GraphDataIr, type GraphFsIo } from './report/graph.ts';
export { parseDeps } from './report/graph.ts';
export { renderMachine, type MachineFormat } from './render/machine.ts';
export { showChangeJson, type ShowDeps, type ShowFsIo } from './report/show.ts';
export { nextReqId, scaffoldSpec, type SpecHelperIo } from './report/specHelpers.ts';
export {
  collectSpecs,
  morphologyOfScenarios,
  renderSpecsJson,
  renderSpecsList,
  type SpecMorphology,
  type SpecSummary,
} from './report/specs.ts';
export {
  SevenZipError,
  makeWasmSevenZip,
  resolveEmbeddedWasmB64,
  type SevenZipPort,
} from './archive/sevenzip.ts';
export {
  ARCHIVE_DIR_REL,
  FREEZE_ARCHIVE_NAME,
  freezeCandidates,
  runFreeze,
  runList,
  runThaw,
  type FreezeIo,
  type FreezeOpts,
  type FreezeRunResult,
  type ThawResult,
} from './archive/freeze.ts';
export {
  buildReview,
  renderReviewHtml,
  specRelFor,
  type ReviewInput,
  type ReviewKind,
  type ReviewResult,
  type ReviewSignal,
  type TagBinding,
} from './review/review.ts';
export {
  TREE_VERSION,
  buildTreeIndex,
  computeSpecHash,
  type HashIo,
  type SerializedDocNode,
  type SerializedScenarioNode,
  type SerializedReqNode,
  type SerializedTreeIndex,
} from './context/tree.ts';
export {
  CONTEXT_DIR_REL,
  PAGEINDEX_DIR_REL,
  REBUILD_LOCK_REL,
  TREE_JSON_REL,
  checkIndexFreshness,
  loadTreeWithAutoRebuild,
  parseLock,
  rebuildIndex,
  type AutoRefreshResult,
  type FreshnessResult,
  type IndexIo,
  type RebuildOpts,
  type RebuildResult,
} from './context/indexStore.ts';
export {
  resolveChatConfig,
  runContextRetrieval,
  unavailableResult,
  type ChatConfig,
  type ContextResult,
  type RetrieveDeps,
  type TierEntry,
  type TreeToolDeps,
} from './context/retrieve.ts';
