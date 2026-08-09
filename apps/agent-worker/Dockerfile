FROM node:22.19.0-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/agent-worker/package.json apps/agent-worker/package.json
COPY packages/agent-runtime/package.json packages/agent-runtime/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
COPY frontend/package.json frontend/package.json

RUN corepack pnpm install --frozen-lockfile

COPY apps/agent-worker apps/agent-worker
COPY packages/agent-runtime packages/agent-runtime
COPY packages/contracts packages/contracts

RUN corepack pnpm --filter @scrollstack/contracts build \
    && corepack pnpm --filter @scrollstack/agent-runtime typecheck \
    && corepack pnpm --filter @scrollstack/agent-worker typecheck

USER node
EXPOSE 8788
CMD ["corepack", "pnpm", "--filter", "@scrollstack/agent-worker", "start"]
