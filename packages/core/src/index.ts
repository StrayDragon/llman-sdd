export const VERSION = '0.1.0';

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

export type {
  CapabilityDoc,
  CapabilityHeader,
  ScenarioClassification,
  ScenarioIR,
  SpecStructuralError,
} from './spec/ir.ts';
export {
  SpecParseError,
  localeToGherkinLang,
  parseCapability,
  parseFeatureSource,
} from './spec/parser.ts';
export { buildReqRegistry, type ReqRegistry, type RegistryDuplicate } from './spec/reqRegistry.ts';
export type {
  SpecEntry,
  SpecIo,
  SpecVerdict,
  ValidationItem,
  ValidationLevel,
  ValidationReport,
} from './validation/validate.ts';
export { validateAllSpecs, validateCapability } from './validation/validate.ts';
export { discoverSpecs, type DiscoveryIo } from './validation/discover.ts';
export type { ChangeBinding } from './change/frontmatter.ts';
export { readBinding, writeBinding } from './change/frontmatter.ts';
export {
  GitError,
  defaultBranch,
  isCleanTree,
  makeSpawnGit,
  mergeBase,
  currentBranch,
  branchExists,
  revParseHead,
  type GitLike,
} from './git/spawnGit.ts';
export { DRAFT_PROPOSAL_TEMPLATE, deriveChangeId, isLegalChangeId } from './change/id.ts';
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
} from './change/lifecycle.ts';
export { normalizeLocale, localeFallbacks } from './templates/locale.ts';
export {
  MAX_UNIT_NESTING_DEPTH,
  MissingUnitError,
  renderTemplate,
  renderWithUnits,
  type UnitRegistry,
} from './templates/engine.ts';
export {
  DEFAULT_SKILL_FILES,
  ETHICS_KEYS,
  OPTIONAL_SKILL_FILES,
  UNIT_FILES,
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
export { runInit, updateFileWithMarkers, type InitResult } from './init/init.ts';
export {
  collectChanges,
  renderChangesList,
  renderChangesJson,
  statusFor,
  stageFor,
  relativeTime,
  statusHuman,
  type ChangeFsIo,
  type ChangeStatus,
  type ChangeSummary,
} from './report/collect.ts';
export { graphMermaid, type GraphFsIo } from './report/graph.ts';
export { showChangeJson, type ShowDeps, type ShowFsIo } from './report/show.ts';
export {
  nextReqId,
  scaffoldSpec,
  skeletonContent,
  type SpecHelperIo,
} from './report/specHelpers.ts';
export {
  collectSpecs,
  renderSpecsJson,
  renderSpecsList,
  type SpecMorphology,
  type SpecSummary,
} from './report/specs.ts';
