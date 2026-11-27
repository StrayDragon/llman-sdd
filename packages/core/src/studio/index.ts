/**
 * Browser-safe Studio pure domain barrel (`@llman-sdd/core/studio`).
 * Contains strictly zero `node:*` imports so Web bundlers (rsbuild) can consume
 * Zod contracts, IR models, semantic Diff, Worldline, and Linter directly.
 */
export * from './model.ts';
export * from './diff.ts';
export * from './validate.ts';
export * from './revisions.ts';
export * from './store.ts';
export * from './contracts.ts';
export * from './decisionTree.ts';
export * from './textfold.ts';
export * from './demos.ts';
export * from './drift.ts';
export * from './forest.ts';
export * from './search.ts';
