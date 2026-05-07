# Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Build backend (and combine)
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
# Copy the built frontend into the spot Express expects
COPY --from=frontend-build /app/frontend/dist ./../frontend/dist
EXPOSE 4000
CMD ["node", "server.js"]