/**
 * Ports (spec monorepo-structure r3): domain logic must not touch the
 * filesystem, git subprocesses, or the terminal directly — side effects are
 * injected through these interfaces. Nothing under packages/core may import
 * `node:fs`, `Bun.$`, or prompt libraries; runtimes wire adapters in.
 */

/** Interaction port. v1 ships an @inquirer/prompts adapter; a future ink TUI
 * ships its own adapter (the two must never run in the same process). */
export interface PromptDriver {
  select<T extends string>(message: string, choices: readonly T[]): Promise<T>;
  multiselect<T extends string>(message: string, choices: readonly T[]): Promise<T[]>;
  confirm(message: string): Promise<boolean>;
}
