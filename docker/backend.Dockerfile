# Dependencies stage
  FROM node:22-bookworm-slim AS deps
  WORKDIR /app
  COPY backend/package.json backend/package-lock.json ./
  RUN npm ci --no-audit --no-fund
  
  # Builder
  FROM node:22-bookworm-slim AS build
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY backend/ ./
  RUN npm run build
  
  # Production Dependencies
  FROM node:22-bookworm-slim AS prod-deps
  WORKDIR /app
  COPY backend/package.json backend/package-lock.json ./
  RUN npm ci --omit=dev --no-audit --no-fund
  
  # Runtime
  FROM node:22-bookworm-slim AS runtime
  WORKDIR /app
  ENV NODE_ENV=production
  
  # Create non root user
  RUN useradd -m -u 1001 appuser
  
  # Copy only what we need
  COPY --from=prod-deps /app/node_modules ./node_modules
  COPY --from=build /app/dist ./dist
  COPY backend/public ./public
  COPY backend/views ./views
  
  # Logs dir 
  RUN mkdir -p /app/dist/logs && chown -R appuser:appuser /app
  
  USER appuser
  EXPOSE 5000
  CMD ["node", "dist/server.js"]
  