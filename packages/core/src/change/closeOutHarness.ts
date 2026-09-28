/**
 * Whether a close-out (finalize / archive) must run specs.check_command before
 * any merge or rename. Pure: the CLI supplies the flags, the spec scan, and
 * the nested-invocation bit.
 */

export type CloseOutHarnessDecision =
  | { kind: 'skip'; announce: boolean; warning?: string }
  | { kind: 'abort'; message: string }
  | { kind: 'run'; command: string };

export function decideCloseOutHarness(input: {
  noCheck: boolean;
  needsSpecsChange: boolean;
  runCommand: string | null;
  nested: boolean;
}): CloseOutHarnessDecision {
  if (input.noCheck) return { kind: 'skip', announce: true };
  if (!input.needsSpecsChange) return { kind: 'skip', announce: false };
  const command = input.runCommand?.trim() ?? '';
  if (command === '') {
    return {
      kind: 'skip',
      announce: false,
      warning:
        'specs.check_command is not configured — close-out skips spec verification. Configure it to gate close-out (see migrations/v0.5-v0.6/README.md).',
    };
  }
  if (input.nested) {
    return { kind: 'abort', message: 'spec check skipped: nested invocation' };
  }
  return { kind: 'run', command };
}
