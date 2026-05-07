# syntax=docker/dockerfile:1.7

# ---- Stage 1: build frontend ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---- Stage 2: install backend production deps ----
FROM node:20-alpine AS backend-deps
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY backend/ ./backend/
COPY --from=backend-deps /app/backend/node_modules ./backend/node_modules
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

WORKDIR /app/backend

EXPOSE 4000

CMD ["node", "src/server.js"]
