# csmju-lab-booking

Lab Booking — ระบบย่อยของโครงการ CSMJU2030 (ตารางการใช้ห้องปฏิบัติการคอมพิวเตอร์)

มาตรฐานกลางอยู่ใน `standards/` (submodule ของ CSMJU2030/csmju2030-standards) ตรึงที่ **v1.5.2**

## โครงสร้าง

| ส่วน | เทคโนโลยี | พอร์ต |
|---|---|---|
| `backend/` | NestJS 11 + Prisma 7.9.1 (`PrismaPg`) + PostgreSQL | 3003 |
| `frontend/` | Next.js (App Router) — proxy `/api/*` และ `/auth/*` ไป backend | 3002 |

- ผู้ใช้เข้าระบบผ่าน **Core Hub SSO เท่านั้น** ไม่มีหน้า login หรือรหัสผ่านของระบบนี้
  (`GET /auth/login` → Core Hub → `GET /auth/callback` → คุกกี้ `csmju_lab_booking_access_token`)
- frontend ไม่ต่อฐานข้อมูลตรง (ARC-01) ทุกอย่างผ่าน backend
- API อยู่ใต้ `/api/v1/...` ตอบด้วย envelope `{ success, data, meta? }` · `GET /api/health` เปิดสาธารณะ

## เริ่มทำงาน

```bash
git clone --recurse-submodules https://github.com/CSMJU2030/csmju-lab-booking.git
cd csmju-lab-booking
pnpm install
```

ถ้า clone ไว้แล้ว: `git submodule update --init standards`

### ตั้งค่า environment

```bash
cp backend/.env.example backend/.env          # แก้ DATABASE_URL, CORE_HUB_URL, CORE_HUB_WEB_URL
cp frontend/.env.example frontend/.env.local
```

`.env` ห้าม commit

### ฐานข้อมูล

```bash
docker compose up -d lab-booking-db           # PostgreSQL 16 ที่พอร์ต 5434
pnpm --filter backend exec prisma migrate deploy
pnpm --filter backend prisma:seed             # ข้อมูลตัวอย่าง (ห้อง)
```

### รันโดยยังไม่มี Core Hub (โหมดทดสอบชั่วคราว)

ใส่ `LOCAL_TEST_ROLE=staff` ใน `backend/.env` (หรือ `student` เพื่อดูอย่างเดียว) แล้ว restart backend
ทุก request จะเป็นผู้ใช้ทดสอบคนเดียว ไม่ตรวจ token — production ตั้งไม่ได้ (บูตไม่ขึ้น) และเปิดไว้จะไม่ผ่าน conformance
ต่อ Core Hub จริง: ลบตัวแปรนี้ ลบโฟลเดอร์ `backend/src/dev/` และบรรทัดที่อ้างถึงใน `app.module.ts` กับ `env.validation.ts`

### รัน

```bash
pnpm --filter backend start:dev               # http://localhost:3003
pnpm --filter frontend dev                    # http://localhost:3002
```

ต้องมี Core Hub รันอยู่และลงทะเบียนระบบนี้แล้ว (ชื่อ `csmju-lab-booking`,
callback `http://localhost:3002/auth/callback`) จึงจะ login ได้

### รันทั้งชุดด้วย Docker

```bash
docker compose up --build
```

## ทดสอบ

```bash
pnpm --filter backend test                    # unit
pnpm --filter backend test:e2e                # e2e (ฐานข้อมูลจำลองในหน่วยความจำ + Core Hub จำลอง)
rm -rf frontend/.next && pnpm -r typecheck    # แบบเดียวกับ CI
pnpm -r lint
pnpm -r build
```

## API contract

`backend/openapi.json` สร้างจากโค้ด — แก้ controller แล้วต้องสร้างใหม่และ commit ใน PR เดียวกัน

```bash
pnpm --filter backend generate:openapi
```

## Prisma

- ชื่อตาราง/คอลัมน์เป็น `snake_case` ผ่าน `@@map`/`@map` ส่วนโค้ดเป็น camelCase
- แก้ schema แล้วสร้าง migration: `pnpm --filter backend exec prisma migrate dev --name <ชื่อ>`
  (เปลี่ยนชื่อคอลัมน์ต้องเขียน `RENAME COLUMN` เอง) ห้ามลบหรือ squash migration เดิม
- ตรวจ drift: `pnpm --filter backend exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
- Prisma pin **7.9.1** ทั้งสามแพ็กเกจ ห้ามอัปเดต

## สิทธิ์

| core role | subsystem role | ทำได้ |
|---|---|---|
| student | STUDENT | ดูตารางและสถานะห้อง |
| alumni | ALUMNI | ดูตารางและสถานะห้อง |
| staff | STAFF | ดู + เพิ่ม/ลบตารางเรียน |
| admin | ADMIN | ทุกอย่าง |

อาจารย์ใช้ core role `staff` (ยังไม่มี role `lecturer` ในมาตรฐานเวอร์ชันนี้)

## ตรวจตามมาตรฐาน

```bash
bash standards/scripts/run-all-checks.sh .
node standards/conformance/run.js             # ต้องมี Core Hub รันอยู่
```

ยกเวอร์ชัน standards:
`git -C standards fetch --tags && git -C standards checkout v<เวอร์ชัน> && cat standards/VERSION > .standards-version && git add standards .standards-version`

ก่อนเปิด PR อ่าน `standards/docs/github-workflow.md` ข้อ 1
