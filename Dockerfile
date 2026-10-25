# syntax=docker/dockerfile:1.7
#
# Turnos IA — production image.
#
#   runner (default)  the app: `node server.js` from Next's standalone output
#   tools             full source + dependencies, for one-off commands:
#                       pnpm db:migrate · pnpm create-admin … · pnpm jobs
#
# Build:  docker build -t turnos-ia .
# See deploy/README.md and docker-compose.prod.yml.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------- deps
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---------------------------------------------------------------- build
FROM deps AS build
COPY . .
# No secrets or database are needed to build: every page renders on request.
RUN pnpm build

# ---------------------------------------------------------------- tools
FROM deps AS tools
COPY . .
ENV NODE_ENV=production
USER node
CMD ["pnpm", "db:migrate"]

# ---------------------------------------------------------------- runner
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
