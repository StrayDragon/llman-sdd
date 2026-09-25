FROM oven/bun:1.4.0-debian
WORKDIR /app
ENV PATH="/root/.bun/bin:${PATH}"
ENV PI_CODING_AGENT_DIR=/tmp/pi-config
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl python3 \
  && rm -rf /var/lib/apt/lists/* \
  && curl -LsSf https://astral.sh/uv/install.sh | sh \
  && /root/.local/bin/uv tool install 'harbor-rewardkit==0.2.*'
ENV PATH="/root/.local/bin:${PATH}"
ENV LITELLM_LOCAL_MODEL_COST_MAP=True
# Pi is preinstalled so trials do not nvm+npm (allowlist would fail).
# bun --global may not link ~/.bun/bin/pi; wrap dist/bundle/cli.js instead.
RUN bun add --global --trust @earendil-works/pi-coding-agent@0.85.1 \
  && git config --global user.email "eval@llman-sdd.local" \
  && git config --global user.name "llman-sdd eval" \
  && mkdir -p /root/.bun/bin /root/.nvm /opt/pi-seed /tmp/pi-config \
  && PI_JS="$(find /root/.bun -path '*pi-coding-agent*/dist/bundle/cli.js' | head -n 1)" \
  && test -n "$PI_JS" \
  && printf '#!/bin/sh\nexec bun %s "$@"\n' "$PI_JS" > /root/.bun/bin/pi.real \
  && chmod 755 /root/.bun/bin/pi.real
COPY nvm-stub.sh /root/.nvm/nvm.sh
COPY pi-wrapper.sh /root/.bun/bin/pi
COPY curl-stub.sh /usr/local/bin/curl
RUN chmod 755 /root/.nvm/nvm.sh /root/.bun/bin/pi /usr/local/bin/curl
