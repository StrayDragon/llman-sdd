import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import {
  buildPiModelsJson,
  fillSentinelIssues,
  FILL_MODEL,
  issuesInEvalGroups,
  PI_HOST_GATEWAY,
  PI_SEED_DIR_IN_CONTAINER,
  renderGroupsExampleYaml,
  renderPiComposeOverlay,
  resolvePiConfig,
  resolveWorktree,
  rewriteUrlHostPort,
  type EvalGroupsDoc,
  type ResolvedPiConfig,
} from './groups-schema.ts';

const yamlRequire = createRequire(join(import.meta.dirname, '../packages/core/package.json'));
const { parse: parseYaml } = yamlRequire('yaml') as { parse: (text: string) => unknown };

const here = import.meta.dirname;
const repoRoot = resolve(here, '..');
const examplePath = join(here, 'groups.yaml.example');
const userConfigPath = join(here, 'groups.yaml');
const playbookPath = join(here, 'tasks', 'playbook');
const seedPath = join(here, 'demo_projects', 'tiny-cli');

function die(message: string, code = 1): never {
  console.error(`eval: ${message}`);
  process.exit(code);
}

function refreshExample(): void {
  writeFileSync(examplePath, renderGroupsExampleYaml());
}

function which(name: string): string | undefined {
  const r = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  const path = r.stdout.trim();
  return r.status === 0 && path !== '' ? path : undefined;
}

function requireCmd(name: string): void {
  if (which(name) === undefined) die(`${name} not found on PATH (required; will not skip)`);
}

function harborArgv(args: string[]): string[] {
  if (which('harbor') !== undefined) return ['harbor', ...args];
  if (which('uvx') !== undefined) return ['uvx', 'harbor', ...args];
  die('harbor not found on PATH (required; will not skip). install Harbor or put uvx on PATH');
}

function loadUserDoc(): EvalGroupsDoc {
  if (!existsSync(userConfigPath)) {
    die(
      `missing ${userConfigPath}\ncopy ${examplePath} → eval/groups.yaml and replace every FILL token, then rerun.`,
      2,
    );
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(userConfigPath, 'utf8'));
  } catch (error) {
    die(`cannot parse eval/groups.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }
  const schemaIssues = issuesInEvalGroups(raw);
  if (schemaIssues.length > 0) die(`eval/groups.yaml schema:\n- ${schemaIssues.join('\n- ')}`);
  const doc = raw as EvalGroupsDoc;
  const fill = fillSentinelIssues(doc);
  if (fill.length > 0) {
    die(
      `eval/groups.yaml still has placeholders (fill before Pi):\n- ${fill.join('\n- ')}\nsee ${examplePath}`,
      2,
    );
  }
  for (const [name, g] of Object.entries(doc.groups)) {
    const worktree = resolveWorktree(g.worktree, repoRoot);
    g.worktree = worktree;
    if (!existsSync(worktree)) die(`groups.${name}.worktree does not exist: ${worktree}`);
  }
  if (!existsSync(seedPath)) die(`seed missing: ${seedPath}`);
  return doc;
}

function ipv4ForHostname(hostname: string): string | undefined {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/u.test(hostname)) return hostname;
  const probes: Array<[string, string[]]> = [
    ['getent', ['ahostsv4', hostname]],
    ['getent', ['hosts', hostname]],
  ];
  for (const [cmd, args] of probes) {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.status !== 0) continue;
    for (const line of r.stdout.split('\n')) {
      const ip = line.trim().split(/\s+/u)[0];
      if (ip !== undefined && /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(ip)) return ip;
    }
  }
  return undefined;
}

function dockerHostGatewayIp(): string | undefined {
  const r = spawnSync(
    'docker',
    ['network', 'inspect', 'bridge', '-f', '{{(index .IPAM.Config 0).Gateway}}'],
    { encoding: 'utf8' },
  );
  const ip = r.stdout.trim();
  return /^(?:\d{1,3}\.){3}\d{1,3}$/u.test(ip) ? ip : undefined;
}

function piAllowHosts(doc: EvalGroupsDoc | undefined): string[] {
  const hosts = [PI_HOST_GATEWAY, ...extraHostsFromDoc(doc, { resolveIps: true })];
  const gw = dockerHostGatewayIp();
  if (gw !== undefined) hosts.push(gw);
  return [...new Set(hosts)];
}

function extraHostsFromDoc(
  doc: EvalGroupsDoc | undefined,
  opts?: { resolveIps?: boolean },
): string[] {
  const url = doc?.openai_base_url;
  if (!url) return [];
  try {
    const host = new URL(url).hostname;
    if (!host) return [];
    if (opts?.resolveIps !== true) return [host];
    const ip = ipv4ForHostname(host);
    return ip === undefined || ip === host ? [host] : [host, ip];
  } catch {
    return [];
  }
}

function dockerMounts(worktree: string, piConfigDir?: string): string {
  const mounts: Array<Record<string, unknown>> = [
    {
      type: 'bind',
      source: resolve(worktree),
      target: '/opt/llman-sdd',
      read_only: true,
      bind: { create_host_path: false },
    },
    {
      type: 'bind',
      source: seedPath,
      target: '/opt/seed',
      read_only: true,
      bind: { create_host_path: false },
    },
  ];
  if (piConfigDir !== undefined) {
    mounts.push({
      type: 'bind',
      source: resolve(piConfigDir),
      target: PI_SEED_DIR_IN_CONTAINER,
      read_only: true,
      bind: { create_host_path: false },
    });
  }
  return JSON.stringify(mounts);
}

function harborArgs(opts: {
  agent: 'pi' | 'oracle';
  worktree: string;
  jobName: string;
  jobsDir: string;
  nAttempts: number;
  extraHosts?: string[];
  pi?: ResolvedPiConfig;
  piConfigDir?: string;
  composeFile?: string;
}): string[] {
  const skills = join(opts.worktree, '.agents', 'skills');
  const args = [
    'run',
    '-p',
    playbookPath,
    '-a',
    opts.agent,
    '-e',
    'docker',
    '-k',
    String(opts.nAttempts),
    '-n',
    '2',
    '--skill',
    skills,
    '--mounts-json',
    dockerMounts(opts.worktree, opts.piConfigDir),
    '-o',
    opts.jobsDir,
    '--job-name',
    opts.jobName,
  ];
  for (const host of opts.extraHosts ?? []) {
    args.push('--allow-environment-host', host, '--allow-agent-host', host);
  }
  if (opts.composeFile !== undefined) {
    args.push('--extra-docker-compose', opts.composeFile);
  }
  if (opts.agent === 'pi' && opts.pi !== undefined) {
    args.push('-m', opts.pi.harborModel);
  }
  return args;
}

function harborInfraFailure(jobsDir: string, jobName: string): string | undefined {
  const jobDir = join(jobsDir, jobName);
  const jobPath = join(jobDir, 'result.json');
  if (!existsSync(jobPath)) return `missing Harbor result ${jobPath}`;
  try {
    const job = JSON.parse(readFileSync(jobPath, 'utf8')) as {
      stats?: { n_errored_trials?: number };
    };
    const errored = job.stats?.n_errored_trials ?? 0;
    if (errored > 0) return `${jobName} had ${errored} errored trial(s)`;
  } catch {
    return `cannot parse ${jobPath}`;
  }
  if (!existsSync(jobDir)) return `missing job dir ${jobDir}`;
  for (const ent of readdirSync(jobDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const trialPath = join(jobDir, ent.name, 'result.json');
    if (!existsSync(trialPath)) continue;
    let trial: {
      exception_info?: { exception_message?: string };
      step_results?: Array<{ step_name?: string; exception_info?: { exception_message?: string } }>;
    };
    try {
      trial = JSON.parse(readFileSync(trialPath, 'utf8')) as typeof trial;
    } catch {
      return `cannot parse ${trialPath}`;
    }
    if (trial.exception_info?.exception_message) {
      return trial.exception_info.exception_message;
    }
    for (const step of trial.step_results ?? []) {
      if (step.exception_info?.exception_message) {
        return `${step.step_name ?? 'step'}: ${step.exception_info.exception_message}`;
      }
    }
  }
  return undefined;
}

function rewardValueGreen(value: unknown): boolean {
  return value === true || value === 1 || (typeof value === 'number' && value === 1);
}

function harborRewardFailures(jobsDir: string, jobName: string): string | undefined {
  const jobDir = join(jobsDir, jobName);
  if (!existsSync(jobDir)) return `missing job dir ${jobDir}`;
  const rewardPaths: string[] = [];
  const stack = [jobDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (dir === undefined) break;
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === 'reward.json') rewardPaths.push(full);
    }
  }
  if (rewardPaths.length === 0) return `${jobName} produced no reward.json`;
  for (const rewardPath of rewardPaths) {
    try {
      const reward = JSON.parse(readFileSync(rewardPath, 'utf8')) as Record<string, unknown>;
      const bad = Object.entries(reward).filter(([, v]) => !rewardValueGreen(v));
      if (bad.length > 0) {
        return `${rewardPath}: ${bad.map(([k, v]) => `${k}=${String(v)}`).join(', ')}`;
      }
    } catch {
      return `cannot parse ${rewardPath}`;
    }
  }
  return undefined;
}

function harborRun(opts: Parameters<typeof harborArgs>[0]): number {
  const argv = harborArgv(harborArgs(opts));
  const proc = spawnSync(argv[0] ?? 'harbor', argv.slice(1), {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
  });
  return proc.status ?? 1;
}

function tryLoadDoc(): EvalGroupsDoc | undefined {
  if (!existsSync(userConfigPath)) return undefined;
  const raw = parseYaml(readFileSync(userConfigPath, 'utf8'));
  if (issuesInEvalGroups(raw).length > 0) return undefined;
  return raw as EvalGroupsDoc;
}

function writePiRuntime(
  runDir: string,
  doc: EvalGroupsDoc,
  proxyPort: number,
): { piConfigDir: string; composeFile: string } {
  const url = (doc.openai_base_url ?? '').trim();
  if (url === '') die('openai_base_url is required for Pi (written into models.json)');
  const piConfigDir = join(runDir, 'pi-config');
  mkdirSync(piConfigDir, { recursive: true });
  const pi = resolvePiConfig(doc);
  const jsonDoc = {
    ...doc,
    openai_base_url: rewriteUrlHostPort(url, PI_HOST_GATEWAY, proxyPort),
  };
  writeFileSync(
    join(piConfigDir, 'models.json'),
    `${JSON.stringify(buildPiModelsJson(jsonDoc), null, 2)}\n`,
  );
  const composeFile = join(runDir, 'docker-compose.pi.yaml');
  writeFileSync(composeFile, renderPiComposeOverlay(pi.thinking));
  return { piConfigDir, composeFile };
}

function startVllmHostProxy(runDir: string, url: string): { port: number; stop: () => void } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    die(`openai_base_url is not a valid URL: ${url}`);
  }
  const destHost = ipv4ForHostname(parsed.hostname);
  if (destHost === undefined) {
    die(`cannot resolve ${parsed.hostname} to IPv4 (needed for host-gateway proxy)`);
  }
  const destPort = parsed.port === '' ? (parsed.protocol === 'https:' ? '443' : '80') : parsed.port;
  const portFile = join(runDir, 'host-gateway-proxy.port');
  const child: ChildProcess = spawn(
    process.execPath,
    [join(here, 'host-gateway-proxy.ts'), destHost, destPort, portFile],
    { stdio: 'ignore' },
  );
  const started = Date.now();
  while (!existsSync(portFile)) {
    if (child.exitCode !== null) die('host-gateway proxy exited before listen');
    if (Date.now() - started > 5000) die('host-gateway proxy did not publish a port');
    spawnSync('sleep', ['0.05']);
  }
  const port = Number(readFileSync(portFile, 'utf8').trim());
  if (!Number.isFinite(port) || port <= 0) die(`host-gateway proxy published invalid port`);
  console.error(`eval: host-gateway proxy ${PI_HOST_GATEWAY}:${port} -> ${destHost}:${destPort}`);
  return {
    port,
    stop: () => {
      if (child.pid !== undefined) child.kill('SIGTERM');
    },
  };
}

function printHarborCommands(agent: 'pi' | 'oracle'): void {
  const doc = tryLoadDoc();
  const groups = doc?.groups ?? { stable: { worktree: '' } };
  const model = doc?.model ?? FILL_MODEL;
  const nAttempts = agent === 'oracle' ? 1 : (doc?.n_attempts ?? 1);
  const extraHosts = agent === 'pi' ? piAllowHosts(doc) : extraHostsFromDoc(doc);
  const pi = resolvePiConfig({ model, pi: doc?.pi });
  for (const name of Object.keys(groups)) {
    const g = groups[name];
    if (!g) continue;
    const args = harborArgs({
      agent,
      worktree: resolveWorktree(g.worktree, repoRoot),
      jobName: `playbook-${name}`,
      jobsDir: join(repoRoot, '.local', 'eval', 'runs', '<run-id>', 'groups', name),
      nAttempts,
      extraHosts,
      pi: agent === 'pi' ? pi : undefined,
      piConfigDir:
        agent === 'pi'
          ? join(repoRoot, '.local', 'eval', 'runs', '<run-id>', 'pi-config')
          : undefined,
      composeFile:
        agent === 'pi'
          ? join(repoRoot, '.local', 'eval', 'runs', '<run-id>', 'docker-compose.pi.yaml')
          : undefined,
    });
    console.log(harborArgv(args).join(' '));
  }
}

function main(): void {
  refreshExample();
  const flags = new Set(process.argv.slice(2));
  const oracleOnly = flags.has('oracle');
  const printCommands = flags.has('--print-commands');
  const agent: 'pi' | 'oracle' = oracleOnly ? 'oracle' : 'pi';
  if (printCommands) {
    printHarborCommands(agent);
    return;
  }
  const doc = loadUserDoc();
  requireCmd('docker');
  if (which('harbor') === undefined && which('uvx') === undefined) {
    die('harbor not found on PATH (required; will not skip). install Harbor or put uvx on PATH');
  }
  const baseline = doc.baseline ?? Object.keys(doc.groups)[0];
  if (baseline === undefined || !(baseline in doc.groups)) {
    die('baseline resolution failed');
  }
  const runId = new Date().toISOString().replaceAll(/[:.]/gu, '-');
  const runDir = join(repoRoot, '.local', 'eval', 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'config.snapshot.yaml'), readFileSync(userConfigPath));
  let stopProxy = (): void => {};
  process.on('exit', () => {
    stopProxy();
  });
  let piRuntime: { piConfigDir: string; composeFile: string } | undefined;
  if (agent === 'pi') {
    const url = (doc.openai_base_url ?? '').trim();
    if (url === '') die('openai_base_url is required for Pi (written into models.json)');
    const proxy = startVllmHostProxy(runDir, url);
    stopProxy = proxy.stop;
    piRuntime = writePiRuntime(runDir, doc, proxy.port);
  }
  const pi = agent === 'pi' ? resolvePiConfig(doc) : undefined;
  const nAttempts = oracleOnly ? 1 : doc.n_attempts;
  const insufficient = !oracleOnly && nAttempts < 3;
  const groupNames = Object.keys(doc.groups);
  const codes: Record<string, number> = {};
  for (const name of groupNames) {
    const g = doc.groups[name];
    if (!g) continue;
    const jobsDir = join(runDir, 'groups', name);
    mkdirSync(jobsDir, { recursive: true });
    const worktree = resolveWorktree(g.worktree, repoRoot);
    console.error(
      `eval: group ${name} agent=${agent} worktree=${worktree}` +
        (pi === undefined ? '' : ` model=${pi.harborModel} thinking=${pi.thinking}`),
    );
    const jobName = `playbook-${name}`;
    let code = harborRun({
      agent,
      worktree,
      jobName,
      jobsDir,
      nAttempts,
      extraHosts: agent === 'pi' ? piAllowHosts(doc) : extraHostsFromDoc(doc, { resolveIps: true }),
      pi,
      piConfigDir: piRuntime?.piConfigDir,
      composeFile: piRuntime?.composeFile,
    });
    const infra = harborInfraFailure(jobsDir, jobName);
    if (infra !== undefined) {
      console.error(`eval: ${infra}`);
      code = 1;
    } else {
      const rewardFail = harborRewardFailures(jobsDir, jobName);
      if (rewardFail !== undefined) {
        console.error(`eval: not all-1: ${rewardFail}`);
        code = 1;
      }
    }
    codes[name] = code;
  }
  const viewDir = join(runDir, 'groups', baseline);
  const allGreen = Object.values(codes).every((c) => c === 0);
  const rollup = {
    runId,
    agent,
    baseline,
    nAttempts,
    thinking: pi?.thinking ?? null,
    harborModel: pi?.harborModel ?? null,
    insufficient: insufficient ? 'n<3 (insufficient)' : null,
    exitByGroup: codes,
    view: `harbor view ${viewDir}`,
  };
  writeFileSync(join(runDir, 'rollup.json'), `${JSON.stringify(rollup, null, 2)}\n`);
  const summary = [
    `结论: ${allGreen ? 'all groups all-1 rewards' : 'one or more groups failed'}`,
    `agent: ${agent}`,
    `n_attempts: ${nAttempts}${insufficient ? ' — n<3 (insufficient)' : ''}`,
    pi === undefined ? 'model: oracle' : `model: ${pi.harborModel} thinking=${pi.thinking}`,
    `风险: Harbor n_concurrent_trials=2; a single Pi trial may still burst chat`,
    '',
    `run: ${runDir}`,
    `view: harbor view ${viewDir}`,
    'view 说明: 本地 127.0.0.1:8080-8089，无需注册/登录；保持命令运行即可浏览轨迹与 reward。',
  ].join('\n');
  writeFileSync(join(runDir, 'SUMMARY.md'), `${summary}\n`);
  console.log(summary);
  stopProxy();
  if (Object.values(codes).some((c) => c !== 0)) process.exit(1);
}

main();
