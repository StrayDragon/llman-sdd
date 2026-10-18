import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildReview,
  collectChanges,
  discoverSpecs,
  renderReviewHtml,
  specIdOf,
  TEMPLATES_ROOT,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  addReportOutputOptions,
  addSpecDirOption,
  CliError,
  cliMaxScanDepth,
  emitReport,
  exitWith,
  resolveCommandRoot,
  templateIo,
  type CliContext,
} from '../cli-shared.ts';

export function registerReview(program: Command, ctx: CliContext): void {
  const review = program
    .command('review')
    .description('Aggregate review: unbound signals plus a validate sweep');

  review.option('--capability <capability>', 'restrict the sweep to one capability/spec id');
  addReportOutputOptions(review);
  addSpecDirOption(review);
  review
    .option('--export-html <path>', 'write a self-contained HTML report')
    .action(
      (options: {
        capability?: string;
        json?: boolean;
        compactJson?: boolean;
        output?: string;
        exportHtml?: string;
        directory?: string;
      }) => {
        const io = ctx.io;
        const root = resolveCommandRoot(ctx, options.directory);
        const entries = discoverSpecs(join(root, 'llmanspec', 'specs'), ctx.io);
        if (options.capability !== undefined) {
          const known = new Set(entries.map((e) => specIdOf(e)));
          if (!known.has(options.capability)) {
            throw new CliError(`capability \`${options.capability}\` not found`);
          }
        }
        const activeChanges = collectChanges(
          io,
          resolveCommandRoot(ctx, options.directory),
          new Date(),
          {
            maxScanDepth: cliMaxScanDepth(program),
          },
        );
        // B17: 墙钟由 CLI 注入,core 不直读 new Date()
        const now = new Date();
        const result = buildReview({
          entries,
          boundChangeCount: activeChanges.filter((c) => c.hasBinding).length,
          activeChanges,
          capability: options.capability,
        });
        if (options.exportHtml !== undefined) {
          const template = templateIo.readText(join(TEMPLATES_ROOT, 'shared', 'review.html'));
          writeFileSync(options.exportHtml, renderReviewHtml(template, result, now));
          console.log(`wrote ${options.exportHtml}`);
        }
        emitReport({ signals: result.signals, summary: result.summary }, options, () =>
          result.lines.join('\n'),
        );
        if (result.exitCode !== 0) exitWith(result.exitCode);
      },
    );
}
