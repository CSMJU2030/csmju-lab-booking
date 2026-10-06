# REPORT — csmju-lab-booking

## ทดสอบกับ Core Hub จริงในเครื่อง + conformance (2026-10-06)

ตาม `standards/docs/LOCAL_INTEGRATION_GUIDE.md` — Core Hub (3000/3100) + ระบบนี้ (3003/3002) บนเครื่อง AIE
ลงทะเบียน `csmju-lab-booking` ใน BackOffice: callback `http://localhost:3002/auth/callback` ·
mapping `student→STUDENT · alumni→ALUMNI · staff→STAFF · lecturer→STAFF · admin→ADMIN` (ไม่รับ guest) → approve → activate

```
node standards/conformance/run.js
RESULT: 69 passed · 0 failed · 0 skipped · 0 warnings · retries: 0
✅ CONFORMANT — csmju-lab-booking meets standard v1.2 L3
```

ทดสอบด้วยมือผ่าน SSO จริง (ไม่มี LOCAL_TEST_ROLE):
- เปิดระบบโดยไม่ login → ไปหน้า login ของ Core Hub · หลัง login กลับมาหน้าแรก (`SSO_POST_LOGIN_REDIRECT=/`)
- เข้าจากเมนู "ระบบย่อย" ใน Portal ได้โดยไม่ต้องใส่รหัสซ้ำ
- staff: `/api/v1/me` → `user-003 · staff → STAFF` · มีเมนูจัดการตารางเรียน
- student: ไม่มีเมนูอาจารย์ · เปิด `/instructor` เองได้หน้า "ไม่มีสิทธิ์" · จองได้
- alumni: ไม่มีปุ่มจองและเมนูการจอง
- ไม่มี token → `GET /api/v1/me` 401 · ออกจากระบบ → หน้ายืนยันของ Core Hub

แก้ระหว่างทดสอบ: map `lecturer → STAFF` (authorization.md ข้อ 2) · หน้าหลัง login เป็น `/` แทน `/api/v1/me` ·
ซ่อนเมนูการจองจากผู้ที่จองไม่ได้ · ประกาศ `probes` และ `core_hub_web_url` ใน `subsystem.yaml` ·
เพิ่ม `GET /api/v1/schedules/:id` ให้ probe 404/400 ทดสอบได้

## จองห้องแบบเลือกวัน-เวลา + หน้าเว็บตามมาตรฐาน (2026-10-06)

ผลรันจริง (Linux, Node 22, pnpm 9.15.9, PostgreSQL 16) กับ standards v1.7.0

```
./standards/scripts/run-all-checks.sh .     → All 19 checks passed
pnpm --filter backend test                  → 150 passed
pnpm --filter backend test:e2e              → 96 passed
rm -rf frontend/.next && pnpm -r lint/typecheck/build → ผ่าน
prisma migrate deploy (3 migrations) → migrate diff → "No difference detected."
```

ทดสอบกับ backend + frontend จริง (`LOCAL_TEST_ROLE`):
- จองผ่านหน้าเว็บ → `POST /api/v1/reservations` 201 → หน้า "การจองของฉัน" แสดงรายการ · ยกเลิก 200 `{id, deleted:true}`
- จองซ้อนตัวเอง 409 · ชนคาบเรียน 409 (บอกชื่อวิชาและเวลา) · วันย้อนหลัง 400 · body ผิด 400 `VALIDATION_ERROR`
- STUDENT: จองได้ 201 · เพิ่มคาบ 403 · `scope=all` 403 — ALUMNI: จอง 403 — STAFF: ทำได้ทุกข้อ
- มือถือ 360px อ่านได้ครบ

สิ่งที่เปลี่ยน:
- backend: `POST/GET/DELETE /api/v1/reservations`, `GET /api/v1/rooms`, `GET /api/v1/rooms/:id/availability` · permission `reservation:*` · migration `20261006000001_add_reservation_people_count` (เพิ่มคอลัมน์ ไม่แก้ของเดิม) · ล็อก `pg_advisory_xact_lock` ต่อห้อง+วันกันจองพร้อมกันจนเกินโควตา · `bangkok-clock` ย้ายไป `src/common/`
- frontend: ใช้ template `csmju-subsystem-web` ของมาตรฐาน (AppShell, token, ฟอนต์ Noto Sans Thai / Plus Jakarta Sans ผ่าน `next/font`) · หน้า ห้องปฏิบัติการ / จองห้อง / การจองของฉัน / จัดการตารางเรียน · มี loading / empty / error ครบ · เมนูอาจารย์แสดงเฉพาะ staff/admin

ข้อสมมติ: เปิดจอง 08:00–20:00 · ล่วงหน้าไม่เกิน 30 วัน · 1–15 คน/การจอง · 3 กลุ่ม/45 คน ต่อช่วงเวลา · ผ่านกติกาแล้วยืนยันทันที (ยังไม่มีขั้นอนุมัติ)
สีตามมาตรฐานปัจจุบัน (`primary-container` `#2154D9`) — palette `#004C99` เป็นของ design-system v1.3.0 ที่มาตรฐานระบุว่าห้ามใช้ (ui-design-system ข้อ 17.0 ใน standards v1.7.2+)

## ตารางเรียนจริง ภาค 1/2569 (2026-10-06)

ผลรันจริง (Linux, Node 22, pnpm 9.15.9, PostgreSQL 16) กับ standards v1.7.0

```
./standards/scripts/run-all-checks.sh .     → All 19 checks passed
pnpm --filter backend test                  → 145 passed (11 suites)
pnpm --filter backend test:e2e              → 73 passed (3 suites)
rm -rf frontend/.next && pnpm -r lint/typecheck/build → ผ่าน
prisma migrate deploy → seed → seed ซ้ำ → seed --reset → migrate diff → "No difference detected."
```

seed ได้ห้อง 11 ห้อง, `schedules` 48 แถว, `room_schedules` 48 แถว · รันซ้ำได้ `Created 0`
บูต `dist/src/main.js` (`LOCAL_TEST_ROLE=staff`) แล้ว `GET /api/v1/schedules/status` ได้ 10 ห้องที่มีคาบ
และคาบถัดไปตรงกับตารางของวันอังคาร (เวลาไทย) ทุกห้อง

ไฟล์ที่แก้:
- `backend/prisma/seed.ts` — ตารางเรียนจริงทุกชั้นปี (ยกเว้นวิชาศึกษาทั่วไป: ภาษาไทย ภาษาอังกฤษ เกษตรเพื่อชีวิต) ลงทั้ง `schedules` (หน้าแสดงผล) และ `room_schedules` (ตรวจการจองชนคาบเรียน), `--reset` ลบเฉพาะตารางเรียน
- `backend/src/schedules/schedules.service.ts` — สถานะห้องเลิกใช้รายชื่อ `lab1–lab3` ที่เขียนตายตัว ใช้ทุกห้องที่มีคาบ และคิดเฉพาะคาบของ "วันนี้" ตามเวลาไทย (เดิมไม่กรองวัน ห้องจึงขึ้นว่ามีเรียนแม้เป็นคาบของวันอื่น)
- `backend/src/schedules/bangkok-clock.ts` (+ spec) — วันและเวลาปัจจุบันตาม `Asia/Bangkok` ไม่ขึ้นกับ timezone ของ server
- `backend/test/schedules.e2e-spec.ts` — ปรับเทสต์ตามพฤติกรรมใหม่ เพิ่มเคสตารางว่างและคาบของวันอื่น
- `frontend/app/instructor/page.tsx` — ค่าเริ่มต้นห้องในฟอร์มเป็น `Lab คอม 3` แทน `lab1`

ข้อสมมติ: "Labcom 3-4" = ใช้ Lab คอม 3 และ 4 พร้อมกัน (บันทึกห้องละแถว) · `instructor_name` ใส่ `ยังไม่ระบุ` เพราะตารางไม่มีชื่ออาจารย์ · เวลาคาบปี 1 อ่านจากภาพตาราง (มีเศษครึ่งชั่วโมง) · ชื่ออาคารของห้องบรรยาย/วิทย์/คณิตยังเป็นค่าเดา (มี TODO ใน seed)

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
