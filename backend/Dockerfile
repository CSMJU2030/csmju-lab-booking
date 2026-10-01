# ---------- build stage ----------
# build context คือ "รากของ repo" เพราะ pnpm workspace เก็บ lockfile ไว้ที่ราก
#   docker build -f backend/Dockerfile .
FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable pnpm

# `prisma generate` (postinstall) โหลด prisma.config.ts ซึ่งต้องมี DATABASE_URL
# การ generate ไม่ได้ต่อฐานข้อมูล ค่านี้จึงเป็นแค่ placeholder ตอน build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build_only

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/prisma.config.ts
RUN pnpm install --frozen-lockfile --filter backend...

COPY backend/ backend/
RUN pnpm --filter backend exec prisma generate \
 && pnpm --filter backend build

# ---------- runtime stage ----------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable pnpm

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --prod --filter backend... --ignore-scripts \
 && pnpm store prune

# dist/ มีทั้งโค้ดที่ compile แล้ว (dist/src) และ Prisma client (dist/generated/prisma)
COPY --from=builder /app/backend/dist ./backend/dist
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/prisma.config.ts
COPY backend/docker/entrypoint.sh ./backend/docker/entrypoint.sh

RUN chmod +x ./backend/docker/entrypoint.sh && chown -R node:node /app
USER node
WORKDIR /app/backend

EXPOSE 3003

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
