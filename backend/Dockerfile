# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f backend/Dockerfile .
ARG NODE_IMAGE=node:22.17-alpine

# All workspace manifests: npm ci checks the lockfile against every workspace.
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/

FROM manifests AS build
RUN npm ci -w finance-app-backend -w @finance/shared
COPY packages/shared packages/shared
COPY backend backend
RUN npm run build -w finance-app-backend

FROM manifests AS production-deps
RUN npm ci --omit=dev -w finance-app-backend && mkdir -p backend/node_modules

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=production-deps /app/node_modules node_modules
COPY --from=production-deps /app/backend/node_modules backend/node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/backend/package.json backend/
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health > /dev/null || exit 1
CMD ["node", "dist/main.js"]
