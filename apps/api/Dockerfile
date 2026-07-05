# syntax=docker/dockerfile:1
# Build depuis la RACINE du monorepo :
#   docker build -f apps/api/Dockerfile -t vitrine-api .

# ── Stage 1 : build TS (workspace pnpm) ──────────────────────────
FROM node:24-slim AS build
RUN npm install -g pnpm@11.9.0
WORKDIR /repo

# Manifestes d'abord (cache des layers d'install)
COPY pnpm-workspace.yaml package.json .npmrc ./
COPY pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --filter api... --ignore-scripts

# Sources + build (shared puis api)
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @vitrine/shared build && pnpm --filter api build

# Arbre de prod autonome (node_modules résolus, workspace inclus)
# --legacy : pnpm v10+ exige sinon inject-workspace-packages=true pour `deploy`.
RUN pnpm --filter api deploy --prod --legacy /app

# ── Stage 2 : runtime minimal ────────────────────────────────────
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app

# Cloud Run injecte PORT (défaut 8080)
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]
