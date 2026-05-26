FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json

RUN pnpm install --frozen-lockfile --filter server

FROM deps AS builder
WORKDIR /app

COPY apps/server apps/server

RUN pnpm --filter server prisma:generate
RUN pnpm --filter server build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json

RUN pnpm install --prod --frozen-lockfile --filter server

COPY --from=builder /app/apps/server/dist apps/server/dist
COPY --from=builder /app/apps/server/prisma apps/server/prisma

EXPOSE 3001

CMD ["pnpm", "--dir", "/app/apps/server", "start:prod"]
