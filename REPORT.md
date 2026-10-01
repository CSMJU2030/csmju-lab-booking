# REPORT — csmju-lab-booking

## ผลรัน

รันในเครื่อง (Windows, Git Bash) เมื่อ 2026-09-30 กับ standards v1.5.2

```
./standards/scripts/run-all-checks.sh .   → All 19 checks passed
pnpm --filter backend test                → 142 passed (10 suites)
pnpm --filter backend test:e2e            → 71 passed (3 suites)
rm -rf frontend/.next && pnpm -r typecheck → ผ่าน
pnpm -r lint / pnpm -r build              → ผ่าน
prisma migrate deploy + migrate diff      → "No difference detected."
node standards/conformance/run.js         → ยังไม่ได้รัน (ต้องมี Core Hub จริงและ subsystem.yaml ที่แก้ probes แล้ว)
```

ตรวจกับ PostgreSQL 16 จริงแล้ว: `migrate deploy`, seed, build แล้วบูต `dist/src/main.js`
ได้ `/api/health` 200, `/api/v1/schedules` ไม่มี token 401, `/auth/login` 302 ไป Core Hub web พร้อมคุกกี้ state

ตัวตรวจ ARC-02/03 ข้ามเมื่อไม่มี `jq` จึงตรวจซ้ำด้วยสคริปต์ Node ที่เลียนตรรกะเดิม → ผ่าน (ผลจริงรอ CI)

## ไฟล์ที่สร้าง/แก้ไข

- `backend/prisma/` — schema (snake_case ผ่าน `@map`/`@@map`, ทุกตารางมี `created_at`/`updated_at`), migration 2 ชุด (ห้ามลบ/squash), seed
- `backend/src/prisma/` — `PrismaService` (Prisma 7 + `PrismaPg`) และตัวแปลงเวลา (`time.util.ts`) ให้ API คงรูป `HH:MM:SS`
- `backend/src/{schedules,rooms,reservations}/` — ย้ายจาก TypeORM เป็น Prisma, เพิ่ม DTO + ValidationPipe, permission ต่อ route, response แบบ envelope, `DELETE` ตอบ `{id, deleted:true}`
- `backend/src/auth/`, `common/`, `config/`, `health/`, `app-setup.ts`, `main.ts` — คัดลอกจาก reference (ดูด้านล่าง)
- `backend/scripts/generate-openapi.ts`, `backend/openapi.json` — API-01
- `backend/Dockerfile`, `backend/docker/`, `docker-compose.yml`, `.dockerignore` — ตาม reference
- `backend/test/` — e2e ของ auth/SSO (จาก reference) และ `schedules.e2e-spec.ts` (โดเมนของระบบ)
- `frontend/next.config.ts` — proxy `/api/*` และ `/auth/*` ไป backend
- `frontend/app/lib/api.ts`, `frontend/app/components/SessionBar.tsx` — เรียก API แบบ same-origin, 401 → `/auth/login?next=` (silent re-SSO, กันวน 30 วินาที), ปุ่มออกจากระบบ
- `frontend/app/{page,instructor/page}.tsx` — ใช้ `api()` แทน `fetch` ตรงพอร์ต 3003 และเลิกส่ง header `x-user-role` (ห้ามเชื่อ identity จาก header)
- `frontend/package.json` — เพิ่ม `typecheck` = `next typegen && tsc --noEmit`, พอร์ต 3002
- ลบ `backend/pnpm-workspace.yaml` และ `backend/pnpm-lock.yaml` (ไฟล์ค้างจาก scaffold ทำให้ pnpm มองเป็น workspace ซ้อน) lock อยู่ที่รากที่เดียว
- `README.md`, `REPORT.md`

## ชั้น auth ที่คัดลอกมา

- คัดลอกจาก `demo-student-subsystem` branch `feature/student-service/silent-sso` (ผ่าน conformance 69/69 ตาม `CHANGELOG.md` ของ standards)
  เพราะ `main` ของ reference ยังเป็นสัญญา 1.0 (ไม่มี `/auth/login`, state, `/auth/logout`)
- ไฟล์: `src/auth/**` (jwks, token verifier, guards, decorators, sso-callback, sso-session, next-path, me, auth-events, dto และ spec),
  `src/common/**` (envelope, exception filter, response interceptor, pagination, throttler), `src/config/**`, `src/health/**`,
  `src/app-setup.ts`, `src/main.ts`, `test/helpers/**`, `test/sso-callback.e2e-spec.ts`, `test/hardening.e2e-spec.ts`
- แก้ไข: เฉพาะชื่อระบบ (`student-service` → `csmju-lab-booking`) และพอร์ต default 3003 `permissions.ts`/`role-mapping` เขียนตามที่มาตรฐานให้แก้ได้
  และปรับ spec ของ permission/guard/hardening ให้ตรงกับโดเมนนี้ ตรรกะยืนยัน token ไม่ถูกแก้

## Role mapping ที่ประกาศ (ต้องตรงกับ default_role_mapping ในทะเบียน)

| core role | subsystem role |
|---|---|
| student | STUDENT |
| alumni | ALUMNI |
| staff | STAFF |
| admin | ADMIN |

| subsystem role | permission |
|---|---|
| STUDENT, ALUMNI | `schedule:read`, `room:read` |
| STAFF | + `schedule:create`, `schedule:delete` |
| ADMIN | ทุกอย่าง |

## ข้อสมมติที่ตั้งเอง (เพราะมาตรฐานไม่ได้ระบุ)

1. อาจารย์ใช้ core role `staff` (มาตรฐานยังไม่มี role `lecturer`) → PM ต้องยืนยัน mapping ในทะเบียน
2. ทุกคนที่ login ได้ดูตารางและสถานะห้องได้ เฉพาะ staff/admin เพิ่ม-ลบตารางเรียนได้ (เดิมไม่มีการตรวจสิทธิ์เลย)
3. `ReservationsService` (จองห้อง) ยังไม่มี route สาธารณะ เหมือนเดิม จึงยังไม่มี permission ของการจอง
4. `GET /api/v1/schedules/status` ยังใช้ห้องคงที่ `lab1`/`lab2`/`lab3` เหมือนโค้ดเดิม
5. การลบตารางที่ไม่มีอยู่ตอบ 404 (เดิมเงียบ) และเวลาเริ่มต้องน้อยกว่าเวลาสิ้นสุด (400)
6. ตัด relation `Section`→`Schedule` ที่ไม่มี field รองรับใน entity เดิมออก

## สิ่งที่ยังทำไม่ได้ / เคสที่ยังไม่ผ่าน

- conformance L1–L3 ยังไม่ได้รัน: ต้องมี Core Hub, ลงทะเบียนระบบ (ชื่อ `csmju-lab-booking`, callback `http://localhost:3002/auth/callback`)
  และ `subsystem.yaml` (`probes` ยังเป็น placeholder, `standards_version`) ซึ่ง DevOps/PM เป็นเจ้าของ (GH-03) แก้เองไม่ได้
- `packageManager` ยังเป็น `pnpm@9.15.9` แต่ `tech-stack.md` กำหนด `12.3.4` — ลองแล้ว pnpm 12 ปฏิเสธ lockfile ปัจจุบันด้วยนโยบาย `minimumReleaseAge`
  ต้องให้ทีมตัดสินใจและสร้าง lockfile ใหม่พร้อมกัน
- `backend/openapi.json` ต้องให้ PM ร่วม approve ใน PR
- ยังไม่มี integration test กับ PostgreSQL จริงใน repo (ทดสอบมือแล้วตามด้านบน)
- UI ยังใช้ Tailwind ตรง ๆ ไม่ผ่าน `@csmju2030/design-system` (`ui-design-system.md`) และยังไม่ได้ไล่ตรวจหน้าจอในเบราว์เซอร์จริง
