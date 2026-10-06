import { DayOfWeek } from '../../generated/prisma/client';

// ตารางเรียนและการจองอ้างอิงเวลาไทยเสมอ ไม่ว่า server จะตั้ง timezone เป็นอะไร (เช่น UTC ใน Docker)
const TIME_ZONE = 'Asia/Bangkok';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface BangkokClock {
  /** วันที่ตามเวลาไทย รูปแบบ YYYY-MM-DD */
  date: string;
  day: DayOfWeek;
  /** นาทีนับจากเที่ยงคืน (0–1439) ตามเวลาไทย */
  minutes: number;
}

export function bangkokClock(now: Date = new Date()): BangkokClock {
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    day: part('weekday').toUpperCase() as DayOfWeek,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

const WEEKDAYS: DayOfWeek[] = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

/** วันในสัปดาห์ของวันที่ YYYY-MM-DD (ไม่ขึ้นกับ timezone ของ server) */
export function dayOfWeekOf(date: string): { day: DayOfWeek; index: number } {
  const index = new Date(`${date}T00:00:00Z`).getUTCDay();
  return { day: WEEKDAYS[index], index };
}

/** บวกวันให้วันที่ YYYY-MM-DD */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
