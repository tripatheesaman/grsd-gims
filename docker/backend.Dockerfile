  FROM node:22-bookworm-slim AS deps
  WORKDIR /app
  COPY backend/package.json backend/package-lock.json ./
  RUN npm ci --no-audit --no-fund
  
  FROM node:22-bookworm-slim AS build
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY backend/ ./
  RUN npm run build
  
  FROM node:22-bookworm-slim AS prod-deps
  WORKDIR /app
  COPY backend/package.json backend/package-lock.json ./
  RUN npm ci --omit=dev --no-audit --no-fund
  
  FROM node:22-bookworm-slim AS runtime
  WORKDIR /app
  ENV NODE_ENV=production
  
  RUN useradd -m -u 1001 appuser
  
  COPY --from=prod-deps /app/node_modules ./node_modules
  COPY --from=build /app/dist ./dist
  COPY backend/public ./public
  COPY backend/views ./views
  
  RUN mkdir -p /app/dist/logs && chown -R appuser:appuser /app
  
  USER appuser
  EXPOSE 5000
  CMD ["node", "dist/server.js"]
  