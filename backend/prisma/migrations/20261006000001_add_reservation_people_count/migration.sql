-- จำนวนคนต่อการจอง 1 ครั้ง (หน้าเว็บจำกัด 1–15 คน, ห้องรับรวมไม่เกิน 45 คน)
ALTER TABLE "reservations" ADD COLUMN "people_count" INTEGER NOT NULL DEFAULT 1;

-- ตรวจการจองซ้อนค้นตามห้อง + วันที่เสมอ
CREATE INDEX "reservations_room_id_booking_date_idx" ON "reservations"("room_id", "booking_date");
