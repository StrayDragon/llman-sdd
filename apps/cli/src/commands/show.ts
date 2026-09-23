import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  collectChanges,
  collectSpecs,
  morphologyOfScenarios,
  renderMachine,
  showChangeJson,
} from '@llman-sdd/core';
import type { Command } from 'commander';

import { cliMaxScanDepth, loadSpecEntries, newIo, resolveChangeIdOrExit } from '../cli-shared.ts';
import { makeCliGit } from '../io.ts';

function hasSection(proposal: string, heading: string): boolean {
  return (
    new RegExp(`^## ${heading.replace(/[/\\]/u, '')}\\s*$`, 'mu').test(proposal) ||
    proposal.includes(`## ${heading}`)
  );
}

function renderSpecJson(
  entries: ReturnType<typeof loadSpecEntries>,
  item: string,
  opts: { metaOnly: boolean; noScenarios: boolean },
): Record<string, unknown> {
  const entry = entries.find(
    (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
  );
  const doc = entry?.doc as
    | {
        header: { capability: string | null; purpose: string | null };
        scenarios: {
          name: string;
          classification: string;
          reqIds: string[];
          statement: string;
          steps: { kind: string; text: string }[];
        }[];
      }
    | undefined;
  const cap = entry ? (doc?.header.capability ?? item) : item;
  const purpose = doc?.header.purpose ?? '';
  const humans = doc?.scenarios.filter((s) => s.classification === 'human') ?? [];
  const acceptances = doc?.scenarios.filter((s) => s.classification === 'executable') ?? [];
  const morphology = morphologyOfScenarios(doc?.scenarios ?? []);
  if (opts.metaOnly) {
    return {
      id: item,
      featureId: cap,
      title: cap,
      purpose,
      overview: purpose,
      requirementCount: humans.length,
      morphology,
    };
  }
  const requirements = humans.map((rule) => ({
    reqId: rule.reqIds[0] ?? '',
    title: rule.name,
    text: rule.statement,
    scenarios: opts.noScenarios
      ? []
      : acceptances
          .filter((a) => a.reqIds.some((rid) => rule.reqIds.includes(rid)))
          .map((a) => ({
            id: a.name,
            rawText: `GIVEN: ${a.steps
              .filter((s) => s.kind === 'given')
              .map((s) => s.text)
              .join('\n')}\nWHEN: ${a.steps
              .filter((s) => s.kind === 'when')
              .map((s) => s.text)
              .join('\n')}\nTHEN: ${a.steps
              .filter((s) => s.kind === 'then')
              .map((s) => s.text)
              .join('\n')}`,
            source: 'acceptance',
            reqIds: a.reqIds,
          })),
  }));
  return {
    id: item,
    title: cap,
    purpose,
    overview: purpose,
    requirementCount: humans.length,
    requirements,
    morphology,
  };
}

export function registerShow(program: Command): void {
  program
    .command('show')
    .description('Show a change or spec')
    .argument('<item>')
    .option('--output <format>', 'json | compact | meta-only | no-scenarios | deltas | reqs-only')
    .option('--type <type>', 'force disambiguation: change | spec')
    .option('-r, --requirement <n>', 'spec only: show a specific requirement by 1-based index')
    .action((item: string, options: { output?: string; type?: string; requirement?: string }) => {
      const outTokens = new Set(
        (options.output ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t !== ''),
      );
      const asCompact = outTokens.has('compact');
      const metaOnly = outTokens.has('meta-only');
      const noScenarios = outTokens.has('no-scenarios');
      const reqsOnly = outTokens.has('reqs-only');
      // toon-default-output: no --output → toon; machine modes share the json
      // gates (Why/What validation) and suppress the prefix hint; `human` is the
      // sole v1 text form. Legacy modifiers (meta-only/no-scenarios/reqs-only/
      // deltas/-r) belong to the text face — they route to human (v1 no-op
      // render semantics preserved).
      const wantsMachine = outTokens.has('json') || outTokens.has('toon') || asCompact;
      // no --output at all → toon; explicit legacy-only modifiers → human text
      const isHuman = options.output !== undefined && (outTokens.has('human') || !wantsMachine);
      const asJson = !isHuman;
      const showMode: 'json' | 'compact-json' | 'toon' = asCompact
        ? 'compact-json'
        : outTokens.has('json')
          ? 'json'
          : 'toon';
      // v1: unknown output tokens are rejected by clap; script consumers rely on
      // the deprecation being a no-op render rather than an error.
      // Spec 判定与 collectSpecs/discoverSpecs 同口径:扁平文件与目录式
      // `specs/<cap>/<cap>.feature` 均按 entry 精确 id(capability ?? fileName)
      // 命中;r25 spec id 精确匹配优先于 change 前缀,不做模糊解析。
      // Discover once per run — the spec lookup, summary and JSON render below
      // all share these entries.
      const entries = loadSpecEntries();
      const specEntry = entries.find(
        (e) => (e.doc.header.capability ?? e.fileName.replace(/\.feature$/u, '')) === item,
      );
      const isSpec =
        options.type === 'spec' ||
        existsSync(join('llmanspec', 'specs', `${item}.feature`)) ||
        specEntry !== undefined;

      if (isSpec) {
        const flatSpecPath = join('llmanspec', 'specs', `${item}.feature`);
        // discoverSpecs 的 fileName 已是含 specs 目录前缀的相对路径
        // (如 `llmanspec/specs/<cap>/<cap>.feature`),直接使用。
        const specPath =
          specEntry !== undefined && !existsSync(flatSpecPath) ? specEntry.fileName : flatSpecPath;
        if (!existsSync(specPath)) {
          console.error(`spec not found: ${item}`);
          process.exitCode = 1;
          return;
        }
        if (asJson) {
          console.log(
            renderMachine(
              renderSpecJson(entries, item, {
                metaOnly,
                noScenarios: noScenarios || reqsOnly,
              }),
              showMode,
            ),
          );
          return;
        }
        // text mode: v1 ignores all output modifiers (meta-only/no-scenarios/-r)
        // and renders the full source + morphology.
        const raw = readFileSync(specPath, 'utf8').trimEnd();
        const summary = collectSpecs(entries).find((x) => x.id === item);
        const morphology = summary
          ? `\n\n## Morphology\nruleCount=${summary.morphology.ruleCount} enforced=${summary.morphology.ruleEnforcedCount} pending=${summary.morphology.rulePendingCount} acceptanceCount=${summary.morphology.acceptanceCount}`
          : '';
        console.log(`## Spec\n${raw}${morphology}`);
        return;
      }

      // ---- change ----
      // r61: v1 r112 prefix chain — exact > unique prefix > multiple > not found.
      const resolved = resolveChangeIdOrExit(program, item, { suppressHint: asJson });
      if (resolved === null) return;
      const changeId = resolved.id;
      const viaPrefix = resolved.viaPrefix;
      const proposal = readFileSync(join('llmanspec', 'changes', changeId, 'proposal.md'), 'utf8');
      if (asJson) {
        // v1 parse_change gates: Why first, then What Changes (json only).
        if (!hasSection(proposal, 'Why')) {
          process.exitCode = 1;
          throw new Error('Change must have a Why section');
        }
        if (!hasSection(proposal, 'What Changes')) {
          process.exitCode = 1;
          throw new Error('Change must have a What Changes section');
        }
        const result = showChangeJson(
          {
            io: newIo(),
            git: makeCliGit(process.cwd()),
            root: process.cwd(),
            specsDir: 'llmanspec/specs',
          },
          changeId,
          { matchedViaPrefix: viaPrefix },
        );
        console.log(renderMachine(result, showMode));
        return;
      }
      // text: Stage / path / content / Gates trailer (no section gates).
      const changes = collectChanges(newIo(), process.cwd(), new Date(), {
        maxScanDepth: cliMaxScanDepth(program),
      });
      const change = changes.find((c) => c.name === changeId);
      console.log(`Stage: ${change?.stage ?? 'draft'}`);
      console.log(`path: ${changeId}`);
      process.stdout.write(proposal);
      if (!proposal.endsWith('\n')) console.log();
      const gates = showChangeJson(
        {
          io: newIo(),
          git: makeCliGit(process.cwd()),
          root: process.cwd(),
          specsDir: 'llmanspec/specs',
        },
        changeId,
      ).gateChecks as { name: string; pass: boolean; hint: string }[];
      const passCount = gates.filter((g) => g.pass).length;
      console.log(`Gates: ${passCount}/${gates.length} pass`);
      for (const g of gates.filter((g) => !g.pass)) console.log(`✗ ${g.name}: ${g.hint}`);
    });
}
