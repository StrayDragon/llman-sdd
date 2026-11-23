/**
 * `init --check`: installed llman-sdd skill versions must share the CLI's
 * major.minor. Patch may differ. Missing or unreadable versions fail.
 */

const VERSION_RE = /version:\s*["']?(\d+\.\d+(?:\.\d+)?)["']?/u;

export function readSkillVersion(markdown: string): string | null {
  if (!markdown.startsWith('---')) return null;
  const end = markdown.indexOf('\n---', 3);
  if (end < 0) return null;
  const match = VERSION_RE.exec(markdown.slice(0, end));
  return match?.[1] ?? null;
}

function part(version: string, index: number): number {
  return Math.trunc(Number(version.split('.')[index] ?? '0')) || 0;
}

/** Compatible when major and minor both match. */
export function skillVersionCompatible(skillVersion: string, cliVersion: string): boolean {
  return (
    part(skillVersion, 0) === part(cliVersion, 0) && part(skillVersion, 1) === part(cliVersion, 1)
  );
}

export interface SkillVersionCheck {
  ok: boolean;
  message: string;
}

export function checkSkillVersions(
  skills: readonly { name: string; markdown: string }[],
  cliVersion: string,
): SkillVersionCheck {
  if (skills.length === 0) {
    return {
      ok: false,
      message: `no llman-sdd skills installed; run \`llman-sdd init --update\``,
    };
  }
  const problems: string[] = [];
  for (const skill of skills) {
    const found = readSkillVersion(skill.markdown);
    if (found === null) {
      problems.push(`${skill.name}: metadata.version missing`);
      continue;
    }
    if (!skillVersionCompatible(found, cliVersion)) {
      problems.push(`${skill.name}: ${found} is outside ${cliVersion} (same major.minor required)`);
    }
  }
  if (problems.length > 0) {
    return {
      ok: false,
      message: `${problems.join('\n')}\nrun \`llman-sdd init --update\``,
    };
  }
  return { ok: true, message: `skill versions match llman-sdd ${cliVersion}` };
}
