# Dependencies
  FROM node:22-bookworm-slim AS deps
  WORKDIR /app
  
  # Dependencis for canvas diesel graphs
  RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    fonts-dejavu-core fonts-liberation fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*
  
  COPY frontend/package.json frontend/package-lock.json ./
  RUN npm ci --no-audit --no-fund
  
  # Builder
  FROM node:22-bookworm-slim AS build
  WORKDIR /app
  
  # Runtime for canvas
  RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    fonts-dejavu-core fonts-liberation fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*
  
  COPY --from=deps /app/node_modules ./node_modules
  COPY frontend/ ./
  
  # For next
  RUN chmod +x ./node_modules/.bin/next
  RUN npm run build
  
  # Runtime for prod
  FROM node:22-bookworm-slim AS runtime
  WORKDIR /app
  ENV NODE_ENV=production
  
  RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libcairo2 libpango-1.0-0 libjpeg62-turbo libgif7 librsvg2-2 \
    fonts-dejavu-core fonts-liberation fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*
  
  RUN useradd -m -u 1001 appuser
  
  # Copy only runtime files
  COPY --from=build /app/package.json ./package.json
  COPY --from=build /app/package-lock.json ./package-lock.json
  COPY --from=build /app/next.config.js ./next.config.js
  COPY --from=build /app/public ./public  
  COPY --from=build /app/.next ./.next
  COPY --from=build /app/node_modules ./node_modules
  
  USER appuser
  EXPOSE 3000
  CMD ["npm", "run", "start"]
  