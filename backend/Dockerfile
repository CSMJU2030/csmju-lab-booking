# api ของระบบย่อย (NestJS) — docs/deployment.md ข้อ 3
# build จากรากของ repo เพราะ pnpm workspace เก็บ lockfile ไว้ที่ราก:
#   docker build -f backend/Dockerfile -t csmju-lab-booking-api .
#
# - พอร์ตใน container คือ 4000 (env PORT) ชื่อ service ใน compose คือ "api" — frontend/Dockerfile ฝัง http://api:4000 ไว้
# - ห้ามใส่ secret ใน ARG / ENV — ค่าจริงมาจาก env ตอนรัน (deployment.md ข้อ 4.2)

# ---------- build stage ----------
FROM node:22-alpine AS builder

WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
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
ENV NODE_ENV=production \
    PORT=4000 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# ไม่ใส่ --ignore-scripts: @prisma/engines ต้องดาวน์โหลด engine ที่ `prisma migrate deploy` ใช้ตอนนี้ (deployment.md ข้อ 3.4)
# ลบ store และ cache ของ pnpm ใน RUN เดียวกัน ไม่งั้นติดไปใน image
# postinstall ของ backend รัน `prisma generate` จึงต้องมี schema และ prisma.config.ts ก่อนติดตั้ง
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/prisma.config.ts
RUN corepack enable pnpm \
 && pnpm install --frozen-lockfile --prod --filter backend... \
 && pnpm store prune \
 && rm -rf /root/.local/share/pnpm /root/.cache /tmp/*

# dist/ มีทั้งโค้ดที่ compile แล้ว (dist/src) และ Prisma client (dist/generated/prisma)
COPY --from=builder /app/backend/dist ./backend/dist
COPY --chmod=755 backend/docker/entrypoint.sh ./backend/docker/entrypoint.sh

# ไม่ chown ทั้งโฟลเดอร์ (image จะโตเท่าตัว) — user node อ่านไฟล์ของ root ได้อยู่แล้ว
USER node
WORKDIR /app/backend
EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "dist/src/main.js"]
