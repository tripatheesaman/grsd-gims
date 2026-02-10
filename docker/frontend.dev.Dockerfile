FROM node:22-bookworm-slim
WORKDIR /app
ENV NPM_CONFIG_UNSAFE_PERM=true
ENV NPM_CONFIG_PYTHON=/usr/bin/python3
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 make g++ pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend/ ./
RUN mkdir -p /app/.next /app/.next/cache
EXPOSE 3000
CMD ["npm", "run", "dev"]
