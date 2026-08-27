# ============================================================
# PC Mission — Railway web service (dashboard + API)
# The worker service uses Dockerfile.worker.
# ============================================================
FROM node:20-slim AS base
WORKDIR /app

# Install workspace deps (cache layer)
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install --no-audit --no-fund

# Copy sources and build
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 4000

# Migrations run on boot (idempotent), then serve.
CMD ["sh", "-c", "npm run db:migrate --workspace @pc/api || true; node apps/api/dist/index.js"]
