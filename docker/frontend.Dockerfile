# Stage 1: deps
FROM node:22-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-freefont-ttf \
  && rm -rf /var/lib/apt/lists/*

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund


# Stage 2: build
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-freefont-ttf \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ ./

ARG NEXT_PUBLIC_BASE_PATH
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_IMAGE_BASE_URL

ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_IMAGE_BASE_URL=$NEXT_PUBLIC_IMAGE_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build


# Stage 3: runtime (standalone)
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-freefont-ttf \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN useradd -m -u 1001 appuser

# Put standalone output in its own directory
COPY --from=build /app/.next/standalone /app/standalone
COPY --from=build /app/.next/static /app/standalone/.next/static
COPY --from=build /app/public /app/standalone/public

# Small, robust start script (handles both layouts: server.js OR app/server.js)
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  'if [ -f /app/standalone/server.js ]; then' \
  '  exec node /app/standalone/server.js' \
  'elif [ -f /app/standalone/app/server.js ]; then' \
  '  exec node /app/standalone/app/server.js' \
  'else' \
  '  echo "ERROR: standalone server.js not found";' \
  '  find /app/standalone -maxdepth 3 -name server.js -print || true;' \
  '  ls -la /app/standalone | head -n 200 || true;' \
  '  exit 1;' \
  'fi' \
  > /usr/local/bin/start.sh \
  && chmod +x /usr/local/bin/start.sh \
  && chown -R appuser:appuser /app

USER appuser
EXPOSE 3000
CMD ["/usr/local/bin/start.sh"]