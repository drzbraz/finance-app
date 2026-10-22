# syntax=docker/dockerfile:1
# Build from the repository root: docker build -f frontend/Dockerfile .
FROM node:22.17-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w finance-app-frontend
COPY packages/shared packages/shared
COPY frontend frontend
RUN npm run build -w finance-app-frontend

# Static files plus a same-origin /api proxy to the backend (the CSP allows only 'self').
FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
