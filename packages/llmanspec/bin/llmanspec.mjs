#!/usr/bin/env node
// llmanspec → llman-sdd compat entry: resolve the llman-sdd CLI entry (the
// package's "." export) through the dependency graph and forward all argv
// verbatim (exit code preserved).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const req = createRequire(import.meta.url);
const entry = req.resolve('@llman-sdd/cli');
const result = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
