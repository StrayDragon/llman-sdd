export {
  archiveSchema,
  changeIdSchema,
  sddConfigSchema,
  specsSchema,
  sddSchema,
  type SddConfig,
  type SddConfigInput,
} from './config/schema.ts';
export {
  ConfigValidationError,
  MAX_REPORTED_ISSUES,
  elevateLegacyBdd,
  loadConfig,
  loadConfigDetail,
} from './config/load.ts';
export {
  ChangeIdError,
  compileChangeIdPattern,
  renderChangeIdTemplate,
} from './config/changeId.ts';
export { renderConfigOverview } from './config/surface.ts';

export type {
  CapabilityDoc,
  CapabilityHeader,
  RuleIR,
  ScenarioIR,
  ScenarioStep,
  SpecStructuralError,
} from './spec/ir.ts';
export { assignSpecIds, featureRelPath, preferredSpecIdFromRel } from './spec/assignSpecIds.ts';
export { ruleHasRunnableScenario, specIdOf } from './spec/ir.ts';
export {
  SpecParseError,
  localeToGherkinLang,
  parseCapability,
  parseFeatureSource,
  sourceDialect,
} from './spec/parser.ts';
export {
  BLOCK_KEYWORD_LINE_RE,
  officialKeywords,
  officialKeywordsOrEn,
  stepKeywordToOfficialKind,
  STEP_KIND_BY_KEYWORD,
  type GherkinKeywords,
} from './spec/keywords.ts';
export {
  buildReqRegistry,
  type RegistryDuplicate,
  type RegistryOccurrence,
  type ReqRegistry,
} from './spec/reqRegistry.ts';
export {
  analyzeLegacy,
  hasNativeRules,
  migrateNativeSource,
  type MigrateBlock,
  type MigrateResult,
} from './spec/migrateNative.ts';
export { stripLegacyHeaderLines } from './spec/migrateScope.ts';
export {
  MIGRATIONS,
  compareVersions,
  isValidVersion,
  knownMigrationVersions,
  migrationOverviewLines,
  migrationPrompt,
  parseVersionExpr,
  resolveMigrations,
  type MigrationDoc,
  type MigrationItem,
} from './project/migrations.ts';
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
  SpecVerdict,
  ValidationItem,
  ValidationLevel,
  ValidationReport,
} from './validation/validate.ts';
export { validateAllSpecs, validateCapability } from './validation/validate.ts';
export { buildDuplicatesFor, formatTotals } from './validation/validate.ts';
export {
  TRANSITIONS_INTROSPECTION,
  extractTransitions,
  isTransitionOutline,
  resolveTransitionColumns,
  resolveTransitionDecision,
  type ColumnMap,
  type TransitionDecision,
  type TransitionEdge,
} from './validation/xstateTransitions.ts';
export { splitVerb } from './config/changeId.ts';
export {
  checkChangeDoc,
  validateChange,
  checkGlobalChangeIdUniqueness,
  collectChangeIdValues,
  STAGE_ORDER,
  type ChangeCheckConfig,
  type ChangeCheckInput,
  type ChangeCheckResult,
  type ChangeIssue,
  type ChangeFsIoLite,
  type StageGate,
} from './validation/changeCheck.ts';
export { discoverSpecs, type DiscoveryIo } from './validation/discover.ts';
export {
  discoverRoots,
  isValidRoot,
  resolveInstanceRoot,
  ROOT_EXCLUDED_DIRS,
  type RootEntry,
  type RootsIo,
} from './validation/roots.ts';
export {
  computeCrossRootCollisions,
  type CrossRootCollision,
  type CrossRootNamespace,
  type RootNamespaceValues,
} from './validation/crossRoot.ts';
export {
  expandRunCommand,
  runHarnessForSpecs,
  type HarnessGate,
  type HarnessRunner,
  type HarnessRunOutcome,
  type HarnessTarget,
} from './validation/harness.ts';
export type { ChangeBinding } from './change/frontmatter.ts';
export {
  readBinding,
  writeBinding,
  extractFrontmatter,
  readFrontmatterTitle,
  readNeedsSpecsChange,
  specsPrefixOfInstance,
} from './change/frontmatter.ts';
export {
  GitError,
  defaultBranch,
  isCleanTree,
  localBranchExists,
  makeSpawnGit,
  currentBranch,
  worktreeList,
  probeMainCheckout,
  probeForkSource,
  nonMainCheckoutWarning,
  type GitLike,
  type WorktreeEntry,
  type MainCheckoutProbe,
  type ForkSource,
} from './git/spawnGit.ts';
export { DRAFT_PROPOSAL_TEMPLATE, deriveChangeId } from './change/id.ts';
export { parseTaskCheckboxes, type ParsedTaskCheckboxes } from './change/tasks.ts';
export { CLOSE_OUT_TASK_HINT, closeOutTaskLines, isCloseOutTaskTitle } from './change/tasks.ts';
export { decideCloseOutHarness, type CloseOutHarnessDecision } from './change/closeOutHarness.ts';
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
  type AttachBaseSource,
  type AttachResult,
  type FinalizeResult,
  type FsIo,
  archiveChange,
  archiveTaskGate,
  changeDiffInfo,
} from './change/lifecycle.ts';
export { normalizeLocale, localeFallbacks, DEFAULT_LOCALE } from './locale.ts';
export {
  MAX_UNIT_NESTING_DEPTH,
  renderTemplate,
  renderWithUnits,
  type UnitRegistry,
} from './templates/engine.ts';
export {
  ETHICS_KEYS,
  buildTemplateVars,
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
  refreshSubRootBlocks,
  resolveEffectiveLocale,
  runInit,
  stripManagedBlock,
  updateFileWithMarkers,
  type InitIo,
  type InitResult,
} from './init/init.ts';
export { checkSkillVersions, readSkillVersion, skillVersionCompatible } from './init/skillCheck.ts';
export {
  changeTitle,
  collectChanges,
  statusFor,
  stageFor,
  countTasks,
  firstH1,
  type ChangeFsIo,
  type ChangeStatus,
  type ChangeSummary,
} from './change/collect.ts';
export { renderChangesJson, renderChangesList } from './report/collect.ts';
export {
  buildUnboundFeed,
  collectUnboundRequirements,
  type UnboundFeed,
  type UnboundRequirement,
} from './report/unbound.ts';
export { graphData, graphMermaid, type GraphDataIr, type GraphFsIo } from './report/graph.ts';
export { parseDeps } from './report/graph.ts';
export { renderMachine, type MachineFormat } from './render/machine.ts';
export { showChangeJson, type ShowDeps, type ShowFsIo } from './report/show.ts';
export {
  nextReqId,
  scaffoldSpec,
  skeletonContent,
  type SpecHelperIo,
} from './report/specHelpers.ts';
export {
  collectSpecs,
  morphologyOf,
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
  type WasmSevenZipDeps,
} from './archive/sevenzip.ts';
export {
  ARCHIVE_DIR_REL,
  FREEZE_ARCHIVE_NAME,
  freezeCandidates,
  runFreeze,
  runList,
  runThaw,
  unfenceLegacyCards,
  planUnfenceLegacyCards,
  type FreezeIo,
  type FreezeOpts,
  type FreezeRunResult,
  type ThawResult,
} from './archive/freeze.ts';
export {
  FROZEN_CARD_EXT,
  composeFrozenCard,
  frozenCardIdOf,
  frozenCardName,
  isFrozenCard,
  unfenceFrozenCard,
} from './archive/frozenCard.ts';
export {
  IgnoreChainError,
  collectFilteredEntries,
  discoverIgnoreRoot,
  type CollectFilteredOpts,
  type FilteredCandidate,
  type IgnoreChainIo,
} from './archive/ignoreChain.ts';
export {
  buildReview,
  renderReviewHtml,
  type ReviewInput,
  type ReviewKind,
  type ReviewResult,
  type ReviewSignal,
} from './review/review.ts';
export {
  LEGACY_SDD_STATE_REL,
  SDD_STATE_REL,
  readSddState,
  semverLt,
  writeSddState,
  type SddState,
} from './context/sddState.ts';
export { maxUsedNumber, nextNumber } from './util/nextNumber.ts';
export {
  COMPLETION_BIN,
  COMPLETION_MARKER_END,
  COMPLETION_MARKER_START,
  COMPLETION_SHELLS,
  collectFlags,
  completionBlock,
  isCompletionShell,
  renderCompletionScript,
  resolveBashRc,
  upsertCompletionBlock,
  type CompletionCommandSpec,
  type CompletionShell,
} from './self/completion.ts';
export {
  cloneMachineDraft,
  cloneMachineIR,
  makeMachineKey,
  nextPrefixedUid,
  type DocDraftChangeKind,
  type EdgeBendOffset,
  type MachineDraft,
  type MachineDraftMode,
  type MachineTimeline,
  type NodePosition,
  type RevisionOp,
  type SemanticAnchor,
  type StudioComment,
  type StudioDocDraft,
  type StudioGraphKind,
  type StudioMachineColumns,
  type StudioMachineIR,
  type StudioRevisionProposal,
  type StudioStateDoc,
  type StudioStateNode,
  type StudioTransitionEdge,
  type TimelineActor,
  type TimelineEntry,
} from './studio/model.ts';
export {
  createMachineDraft,
  extractStudioMachines,
  markMachineRemoved,
  type CreateMachineDraftInput,
  type ExtractedStudioMachine,
} from './studio/extract.ts';
export {
  FLOWCHART_LINTER_RULES,
  STUDIO_LINTER_RULES,
  hasBlockingDiagnostics,
  validateMachineGraph,
  type DiagnosticFixKind,
  type DiagnosticSeverity,
  type DiagnosticTargetKind,
  type MachineDiagnostic,
  type StudioLinterRuleMeta,
} from './studio/validate.ts';
export {
  computeMachineDiff,
  computeWorldlineOverlayDiff,
  formatSemanticDiff,
  type MachineSemanticDiff,
  type StateRenameDiff,
  type TransitionChangedField,
  type TransitionModifiedDiff,
  type WorldlineOverlayDiff,
} from './studio/diff.ts';
export {
  StudioRevisionError,
  acceptRevisionProposal,
  addStudioComment,
  applyRevisionOpsToMachine,
  deleteStudioComment,
  editStudioComment,
  previewRevisionProposal,
  proposeRevision,
  rejectRevisionProposal,
  reopenStudioComment,
  replyStudioComment,
  resolveStudioComment,
  type AddCommentInput,
  type ProposeRevisionInput,
  type RevisionPreviewResult,
} from './studio/revisions.ts';
export {
  STUDIO_STATES_REL,
  StudioStateError,
  buildInitialTimeline,
  createStudioStateDoc,
  deleteStudioState,
  listStudioStates,
  parseStudioStateDoc,
  previewTimelineEntry,
  readStudioState,
  recordTimelineCommit,
  recordWorldlineCommit,
  redoTimeline,
  rollbackTimeline,
  studioStateDocSchema,
  studioStateRelPath,
  switchWorldlineHead,
  undoTimeline,
  validateStateId,
  writeStudioState,
  type CreateStudioStateDocInput,
  type StudioStateIo,
  type StudioStateSummary,
} from './studio/store.ts';
export {
  buildDemoJobRunnerDraft,
  buildDemoReimbursementDraft,
  buildDemoStudioDrafts,
  buildDemoStudioWebDrafts,
} from './studio/demos.ts';
export {
  compileDecisionTableToTree,
  detectConvertibleStructure,
  extractDecisionTables,
  type ConvertibleStructureHint,
  type DecisionTreeEdge,
  type DecisionTreeGraph,
  type DecisionTreeNode,
  type StudioDecisionTable,
} from './studio/decisionTree.ts';
export { foldFeatureAst, foldPlainText, type TextfoldLevels } from './studio/textfold.ts';
export {
  bootstrapResponseSchema,
  convertibleHintSchema,
  decisionTreeEdgeSchema,
  decisionTreeNodeSchema,
  exportProposalRequestSchema,
  exportProposalResponseSchema,
  healthResponseSchema,
  hubInfoSchema,
  previewDiffResponseSchema,
  putLayoutRequestSchema,
  putStateRequestSchema,
  putStateResponseSchema,
  registerWorkspaceRequestSchema,
  specDetailResponseSchema,
  specIndexEdgeSchema,
  specIndexItemSchema,
  specRuleItemSchema,
  studioDecisionTableSchema,
  studioFocusContextSchema,
  studioGraphKindSchema,
  studioSpecKindSchema,
  studioSseEventSchema,
  textfoldRequestSchema,
  textfoldResponseSchema,
  verificationHardnessSchema,
  workspaceItemSchema,
  workspacesResponseSchema,
  type BootstrapResponse,
  type ExportProposalRequest,
  type ExportProposalResponse,
  type HealthResponse,
  type HubInfo,
  type PreviewDiffResponse,
  type PutLayoutRequest,
  type PutStateRequest,
  type PutStateResponse,
  type RegisterWorkspaceRequest,
  type SpecDetailResponse,
  type SpecIndexEdge,
  type SpecIndexItem,
  type SpecRuleItem,
  type StudioDecisionTableDto,
  type StudioFocusContext,
  type StudioSseEvent,
  type TextfoldRequest,
  type TextfoldResponse,
  type WorkspaceItem,
  type WorkspacesResponse,
} from './studio/contracts.ts';
export {
  StudioSyncError,
  buildProposalDraft,
  previewFeatureUnifiedDiff,
  renderUpdatedFeatureSource,
  type BuildProposalDraftInput,
} from './studio/featureSync.ts';
export {
  applyDriftProposalsToStateDoc,
  buildDriftRevisionProposals,
  buildDriftSlicePacket,
  parseRuntimeTraceJsonl,
  parseUnifiedDiffHunks,
  reconcileRuntimeTrace,
  runtimeTraceEventSchema,
  scanLlmanspecAnchors,
  type DriftDiffFileInput,
  type DriftImpactedSpec,
  type DriftMatchedFileSlice,
  type DriftRevisionProposalDraft,
  type DriftSlicePacket,
  type LlmanspecAnchorMatch,
  type ParseRuntimeTraceResult,
  type ParsedDiffFile,
  type ParsedRuntimeTraceEvent,
  type RuntimeTraceEvent,
  type RuntimeTraceParseError,
  type RuntimeTraceReconcileResult,
  type ShadowTransitionFinding,
  type UncoveredTransitionFinding,
  type UnifiedDiffHunk,
  type UnknownMachineFinding,
} from './studio/drift.ts';
