#!/bin/sh
# ตอนสตาร์ตใช้ `prisma migrate deploy` เท่านั้น — ห้าม migrate dev / db push / seed (deployment.md ข้อ 3.4)
set -e

echo "[entrypoint] applying database migrations ..."
./node_modules/.bin/prisma migrate deploy

echo "[entrypoint] starting csmju-lab-booking api"
exec "$@"
