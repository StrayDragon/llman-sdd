/**
 * On-demand single-instance Hub registry (~/.llman-sdd/studio-hub.json) with /api/health probing
 * and zombie-lock self-healing (studio-web r144). Dual-runtime safe (node:fs + node:os + fetch).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  healthResponseSchema,
  hubInfoSchema,
  type HealthResponse,
  type HubInfo,
} from '@llman-sdd/core';

let tmpCounter = 0;

export function isLoopbackHost(host: string): boolean {
  const norm = host.trim().toLowerCase();
  return norm === '127.0.0.1' || norm === 'localhost' || norm === '::1';
}

export function formatLoopbackUrl(host: string, port: number): string {
  const hostPart = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${hostPart}:${String(port)}`;
}

export function defaultHubFilePath(): string {
  return join(homedir(), '.llman-sdd', 'studio-hub.json');
}

export function readHubInfoFile(hubFilePath: string): HubInfo | null {
  if (!existsSync(hubFilePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(hubFilePath, 'utf8')) as unknown;
    const parsed = hubInfoSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeHubInfoFile(hubFilePath: string, info: HubInfo): void {
  const checked = hubInfoSchema.parse(info);
  mkdirSync(dirname(hubFilePath), { recursive: true });
  tmpCounter += 1;
  const tmpPath = `${hubFilePath}.tmp.${String(process.pid)}.${String(tmpCounter)}`;
  writeFileSync(tmpPath, `${JSON.stringify(checked, null, 2)}\n`, 'utf8');
  renameSync(tmpPath, hubFilePath);
}

export function removeHubInfoFile(hubFilePath: string): void {
  if (existsSync(hubFilePath)) {
    rmSync(hubFilePath, { force: true });
  }
}

export async function probeHubHealth(
  host: string,
  port: number,
  timeoutMs = 1500,
): Promise<HealthResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${formatLoopbackUrl(host, port)}/api/health`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const parsed = healthResponseSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Inspect studio-hub.json, probe live health, and automatically clean up stale/zombie lock files.
 */
export async function resolveLiveHub(
  hubFilePath = defaultHubFilePath(),
): Promise<{ info: HubInfo; health: HealthResponse } | null> {
  const info = readHubInfoFile(hubFilePath);
  if (!info) {
    removeHubInfoFile(hubFilePath);
    return null;
  }
  const health = await probeHubHealth(info.host, info.port);
  if (!health || health.pid !== info.pid) {
    removeHubInfoFile(hubFilePath);
    return null;
  }
  return { info, health };
}
