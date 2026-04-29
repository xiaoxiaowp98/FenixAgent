FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
COPY web ./web
COPY components.json ./
RUN bun run build:web
RUN bun build src/index.ts --outfile=dist/server.js --target=bun

FROM oven/bun:1-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV RCS_HOST=0.0.0.0
ENV RCS_PORT=3000
# RCS persists SQLite here by default inside the container.
ENV RCS_DB_PATH=/app/data/rcs.db
ENV BUN_INSTALL_GLOBAL=/root/.bun
ENV PATH=/root/.bun/bin:${PATH}
ENV OPENCODE_DISABLE_AUTOUPDATE=1
ENV OPENCODE_DISABLE_TELEMETRY=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client ripgrep \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
RUN bun install -g opencode-ai@latest

COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist

# Runtime directories:
# - /app/data: RCS SQLite DB
# - /root/.config/opencode: OpenCode global config used by RCS
# - /root/.agents/skills: skill storage used by RCS
# - /root/.local/share/opencode: OpenCode runtime/auth data
# - /workspaces: container-internal agent workspaces
RUN mkdir -p /app/data /root/.config/opencode /root/.agents/skills /root/.local/share/opencode /workspaces
COPY .agent/skills/ /root/.agents/skills/

VOLUME ["/app/data", "/root/.config/opencode", "/root/.agents/skills", "/root/.local/share/opencode", "/workspaces"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/health').then((r) => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["bun", "dist/server.js"]
