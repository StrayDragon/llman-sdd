import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildReview,
  collectChanges,
  renderMachine,
  renderReviewHtml,
  specIdOf,
  TEMPLATES_ROOT,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  CliError,
  cliMaxScanDepth,
  exitWith,
  loadCliConfig,
  loadSpecEntries,
  newIo,
  resolveOutMode,
  templateIo,
} from '../cli-shared.ts';

export function registerReview(program: Command): void {
  const review = program
    .command('review')
    .description('Aggregate review: unbound signals plus a validate sweep');

  review.option('--capability <capability>', 'restrict the sweep to one capability/spec id');
  addReportOutputOptions(review);
  review
    .option('--export-html <path>', 'write a self-contained HTML report')
    .action(
      (options: {
        capability?: string;
        json?: boolean;
        compactJson?: boolean;
        output?: string;
        exportHtml?: string;
      }) => {
        const io = newIo();
        const entries = loadSpecEntries();
        if (options.capability !== undefined) {
          const known = new Set(entries.map((e) => specIdOf(e)));
          if (!known.has(options.capability)) {
            throw new CliError(`capability \`${options.capability}\` not found`);
          }
        }
        const activeChanges = collectChanges(io, process.cwd(), new Date(), {
          maxScanDepth: cliMaxScanDepth(program),
        });
        // B17: 墙钟由 CLI 注入,core 不直读 new Date()
        const now = new Date();
        const result = buildReview(
          {
            entries,
            boundChangeCount: activeChanges.filter((c) => c.hasBinding).length,
            activeChanges,
            capability: options.capability,
            checkTransitions: Boolean(loadCliConfig()?.specs?.check_transitions),
          },
          io,
        );
        if (options.exportHtml !== undefined) {
          const template = templateIo.readText(join(TEMPLATES_ROOT, 'shared', 'review.html'));
          writeFileSync(options.exportHtml, renderReviewHtml(template, result, now));
          console.log(`wrote ${options.exportHtml}`);
        }
        const outMode = resolveOutMode(options.output, options.json, options.compactJson);
        if (outMode !== 'human') {
          console.log(renderMachine({ signals: result.signals, summary: result.summary }, outMode));
        } else {
          console.log(result.lines.join('\n'));
        }
        if (result.exitCode !== 0) exitWith(result.exitCode);
      },
    );
}
