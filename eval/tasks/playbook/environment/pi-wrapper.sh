#!/bin/sh
# Harbor 0.23 PiOptions has no `max`; 0731 default thinking is max via this wrapper.
# Harbor does not pass --approve; project .agents/skills need it.
# models.json is bind-mounted RO at /opt/pi-seed; Pi must write auth.json so copy.
THINKING="${PI_THINKING:-max}"
export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-/tmp/pi-config}"
mkdir -p "$PI_CODING_AGENT_DIR"
if [ -f /opt/pi-seed/models.json ]; then
  cp /opt/pi-seed/models.json "$PI_CODING_AGENT_DIR/models.json"
fi
exec /root/.bun/bin/pi.real --approve --thinking "$THINKING" "$@"
