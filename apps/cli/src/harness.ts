/**
 * CLI HarnessRunner adapter (validation r13/r48): executes the expanded
 * bdd.run_command through `sh -c` in the project root, exporting
 * LLMAN_SDD_HARNESS_ACTIVE=1 so harness-spawned validate invocations skip
 * execution (nested guard). Windows (no sh) is out of scope for this change —
 * the spawnError branch surfaces it as an ERROR. stdout and stderr are merged;
 * core keeps only the tail.
 */
import { spawnSync } from 'node:child_process';

import type { HarnessRunner } from '@llman-sdd/core';

export function makeCliHarnessRunner(): HarnessRunner {
  return {
    run: (command: string, cwd: string) => {
      const proc = spawnSync('sh', ['-c', command], {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, LLMAN_SDD_HARNESS_ACTIVE: '1' },
      });
      if (proc.error !== undefined || proc.status === null) {
        return {
          exitCode: null,
          output: `${proc.stdout ?? ''}${proc.stderr ?? ''}`,
          spawnError: proc.error !== undefined ? String(proc.error) : 'no exit status from harness',
        };
      }
      return { exitCode: proc.status, output: `${proc.stdout ?? ''}${proc.stderr ?? ''}` };
    },
  };
}
