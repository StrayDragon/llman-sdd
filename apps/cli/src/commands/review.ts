import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildReview,
  collectChanges,
  renderMachine,
  renderReviewHtml,
  TEMPLATES_ROOT,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import {
  loadCliConfigUnchecked,
  loadSpecEntries,
  newIo,
  resolveOutMode,
  templateIo,
} from '../cli-shared.ts';
import { makeCliGit } from '../io.ts';

export function registerReview(program: Command): void {
  const review = program
    .command('review')
    .description('Aggregate review: pending/unbound/stale signals plus a validate sweep');

  review
    .option('--capability <capability>', 'restrict the sweep to one capability/spec id')
    .option('--json', 'emit structured JSON (signals + summary)')
    .option('--output <mode>', 'report format: toon (default) | json | compact-json | human')
    .option('--export-html <path>', 'write a self-contained HTML report')
    .action(
      (options: { capability?: string; json?: boolean; output?: string; exportHtml?: string }) => {
        const config = loadCliConfigUnchecked();
        const bindings = config?.bdd?.bindings?.filter((b) => b.kind === 'tags') ?? [];
        const io = newIo();
        const entries = loadSpecEntries();
        if (options.capability !== undefined) {
          const known = new Set(
            entries.map((e) => e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')),
          );
          if (!known.has(options.capability)) {
            console.error(`capability \`${options.capability}\` not found`);
            process.exitCode = 1;
            return;
          }
        }
        const activeChanges = collectChanges(io, process.cwd(), new Date());
        const result = buildReview(
          {
            entries,
            bindings: bindings.map((b) => ({ kind: 'tags', tags: b.tags })),
            boundChangeCount: activeChanges.filter((c) => c.hasBinding).length,
            activeChanges,
            capability: options.capability,
            git: makeCliGit(process.cwd()),
            root: process.cwd(),
            specsDir: 'llmanspec/specs',
          },
          io,
        );
        if (options.exportHtml !== undefined) {
          const template = templateIo.readText(join(TEMPLATES_ROOT, 'shared', 'review.html'));
          writeFileSync(options.exportHtml, renderReviewHtml(template, result));
          console.log(`wrote ${options.exportHtml}`);
        }
        const outMode = resolveOutMode(options.output, options.json, false);
        if (outMode === null) return;
        if (outMode !== 'human') {
          console.log(renderMachine({ signals: result.signals, summary: result.summary }, outMode));
        } else {
          console.log(result.lines.join('\n'));
        }
        if (result.exitCode !== 0) process.exitCode = result.exitCode;
      },
    );
}
