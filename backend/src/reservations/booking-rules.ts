/**
 * กติกาการจองห้องปฏิบัติการ (ที่เดียวทั้งระบบ — frontend แสดงตามค่าเหล่านี้)
 */

/** ช่วงเวลาที่เปิดให้จอง (เวลาไทย) */
export const BOOKING_OPEN = '08:00';
export const BOOKING_CLOSE = '20:00';

/** จองล่วงหน้าได้ไม่เกินกี่วัน (นับจากวันนี้) */
export const MAX_DAYS_AHEAD = 30;

/** จำนวนคนต่อการจอง 1 ครั้ง */
export const MAX_PEOPLE_PER_BOOKING = 15;

/** ในช่วงเวลาเดียวกัน ห้องหนึ่งรับได้ไม่เกินกี่กลุ่ม และรวมกี่คน */
export const MAX_GROUPS_PER_SLOT = 3;
export const MAX_PEOPLE_PER_SLOT = 45;
