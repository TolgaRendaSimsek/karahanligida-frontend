FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY admin-api/package.json admin-api/pnpm-lock.yaml admin-api/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY admin-api/src ./src

USER node
EXPOSE 3100
CMD ["node", "src/server.mjs"]
