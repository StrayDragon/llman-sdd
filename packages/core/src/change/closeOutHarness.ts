/**
 * Whether a close-out (finalize / archive) must run bdd.run_command before
 * any merge or rename. Pure: the CLI supplies the flags, the spec scan, and
 * the nested-invocation bit.
 */

export type CloseOutHarnessDecision =
  | { kind: 'skip'; announce: boolean }
  | { kind: 'abort'; message: string }
  | { kind: 'run'; command: string };

export function decideCloseOutHarness(input: {
  noCheck: boolean;
  needsSpecsChange: boolean;
  hasExecutable: boolean;
  runCommand: string | null;
  nested: boolean;
}): CloseOutHarnessDecision {
  if (input.noCheck) return { kind: 'skip', announce: true };
  if (!input.needsSpecsChange || !input.hasExecutable) return { kind: 'skip', announce: false };
  const command = input.runCommand?.trim() ?? '';
  if (command === '') {
    return { kind: 'abort', message: 'executable scenarios have no bdd.run_command' };
  }
  if (input.nested) {
    return { kind: 'abort', message: 'bdd harness skipped: nested invocation' };
  }
  return { kind: 'run', command };
}
