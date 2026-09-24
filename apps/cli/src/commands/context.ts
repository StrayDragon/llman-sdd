import { readFileSync } from 'node:fs';

import {
  loadTreeWithAutoRebuild,
  resolveChatConfig,
  runContextRetrieval,
  unavailableResult,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import { CliError, loadSpecEntries, newIo, resolveBackend } from '../cli-shared.ts';

// (err path below converted to CliError; resolveBackend may also throw CliError)

export function registerContext(program: Command): void {
  program
    .command('context')
    .description('Get specs relevant to a task (agent-oriented, pageindex agentic retrieval)')
    .option('--task <task>', 'natural language task description')
    .option('--paths <paths>', 'comma-separated file paths')
    .option('--top <n>', 'max entries per tier', '5')
    .option('--backend <name>', 'retrieval backend (pageindex only)')
    .action(async (options: { task?: string; paths?: string; top?: string; backend?: string }) => {
      resolveBackend(options.backend);
      if (!options.task && !options.paths) {
        throw new CliError('at least one of --task or --paths is required');
      }
      const config = resolveChatConfig(process.env as Record<string, string | undefined>);
      // r62: lazy refresh runs BEFORE the chat-model gate (v1 r97 — the index
      // self-heals even when retrieval subsequently fails with api_error).
      const refresh = loadTreeWithAutoRebuild(newIo(), 'llmanspec/specs', loadSpecEntries(), {
        chatModel: process.env.LLMAN_SDD_INDEX_CHAT_MODEL ?? '',
      });
      if (refresh.tree === null || refresh.error !== null) {
        const failed = unavailableResult();
        failed.status.errorKind = 'index_rebuild_failed';
        failed.status.qualityNote =
          refresh.error ?? 'index rebuild failed — run `llman-sdd index rebuild`';
        console.log(JSON.stringify(failed, null, 2));
        return;
      }
      const tree = refresh.tree;
      if (config === null) {
        // v1 parity: unavailable/error JSON on stdout, exit 0.
        console.log(JSON.stringify(unavailableResult(), null, 2));
        return;
      }
      const result = await runContextRetrieval({
        config,
        task: options.task ?? '',
        paths: options.paths,
        top: Number(options.top),
        tree,
        readFile: (p) => readFileSync(p, 'utf8'),
        root: process.cwd(),
      });
      console.log(JSON.stringify(result, null, 2));
    });
}
