import { DayOfWeek } from '../../generated/prisma/client';

// ตารางเรียนอ้างอิงเวลาไทยเสมอ ไม่ว่า server จะตั้ง timezone เป็นอะไร (เช่น UTC ใน Docker)
const TIME_ZONE = 'Asia/Bangkok';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface BangkokClock {
  day: DayOfWeek;
  /** นาทีนับจากเที่ยงคืน (0–1439) ตามเวลาไทย */
  minutes: number;
}

export function bangkokClock(now: Date = new Date()): BangkokClock {
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return {
    day: part('weekday').toUpperCase() as DayOfWeek,
    minutes: Number(part('hour')) * 60 + Number(part('minute')),
  };
}
