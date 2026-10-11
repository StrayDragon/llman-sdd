/**
 * eval 容器 Pi 凭据注入(lib 层,eval-playbook r86):
 * 宿主 ~/.pi/agent/auth.json → pi-config/auth.json → RO bind /opt/pi-seed → wrapper 条件拷贝。
 * 纯 IO 封装:缺失容错(stderr 提示,不抛),路径可注入便于单测;进程编排仍归 eval/run.ts。
 */
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const AUTH_RELATIVE = join('.pi', 'agent', 'auth.json');

export function resolveAuthJsonPath(home?: string): string {
  return join(home ?? homedir(), AUTH_RELATIVE);
}

export interface CopyAuthResult {
  copied: boolean;
  /** copied=false 时的原因(缺失/同路径);copied=true 为目标路径。 */
  message: string;
}

export function copyAuthIfExists(destDir: string, home?: string): CopyAuthResult {
  const src = resolveAuthJsonPath(home);
  if (!existsSync(src)) {
    return {
      copied: false,
      message: `eval-auth: 宿主 ${src} 不存在,跳过 auth 注入(容器内 Pi 走 models.json apiKey/env)`,
    };
  }
  const dest = join(destDir, 'auth.json');
  if (src === dest) return { copied: false, message: `eval-auth: 源即目标 ${dest},跳过` };
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  return { copied: true, message: dest };
}
