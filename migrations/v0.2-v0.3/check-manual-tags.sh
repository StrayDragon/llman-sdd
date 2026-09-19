#!/usr/bin/env bash
# v0.2 → v0.3 migration check: residual @manual tags in live specs.
# Matches tag-position usage only (Gherkin tag lines start with `@`), so
# normative *mentions* of the tag inside rule statements are not flagged.
# Exit 0 = clean; exit 1 = residuals found (drop the tag; @human already
# carries the human-judgement semantics — see migrations/v0.2-v0.3/README.md).
# Note: after upgrading, `llman-sdd validate --all` is the authoritative gate
# (parser emits a tag:manual-removed ERROR for any residual use).
set -euo pipefail
root="${1:-.}"
specs="$root/llmanspec/specs"
if [ ! -d "$specs" ]; then
  echo "no llmanspec/specs under $root (nothing to check)" >&2
  exit 0
fi
hits=$(grep -rnE '^[[:space:]]*@.*@manual' "$specs" --include='*.feature' || true)
if [ -n "$hits" ]; then
  echo "residual @manual tags found (removed in 0.3.0):" >&2
  echo "$hits" >&2
  exit 1
fi
echo "OK: no @manual tags under $specs"
