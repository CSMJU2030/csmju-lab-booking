// คอลัมน์ time/date ของ Prisma เป็น Date — แปลงจาก/เป็น string เพื่อให้ API คงรูปแบบเดิม
// ("HH:MM:SS" สำหรับเวลา, "YYYY-MM-DD" สำหรับวันที่)

export function toTimeDate(value: string): Date {
  const [h = '00', m = '00', s = '00'] = value.split(':');
  return new Date(
    `1970-01-01T${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}Z`,
  );
}

export function fromTimeDate(value: Date): string {
  return value.toISOString().slice(11, 19);
}

export function toDateOnly(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

export function fromDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
