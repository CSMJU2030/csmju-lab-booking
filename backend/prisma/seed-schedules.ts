import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { DayOfWeek, PrismaClient } from '../generated/prisma/client';
import { toTimeDate } from '../src/prisma/time.util';

interface RawEntry {
  courseCode: string;
  courseName: string;
  day: string;
  time: string; // "10:00 - 12:00"
  room: string;
}
interface RawPlan {
  year: number;
  plan: string;
  schedule: RawEntry[];
}

const DEFAULT_INSTRUCTOR = 'ไม่ระบุ';
const TIME_RE = /^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/;

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  const plans = JSON.parse(
    readFileSync(join(__dirname, '../src/seeds/schedules.json'), 'utf-8'),
  ) as RawPlan[];

  const validDays = new Set<string>(Object.values(DayOfWeek));
  const seen = new Set<string>();
  let created = 0;
  let existing = 0;
  let skipped = 0;

  try {
    for (const plan of plans) {
      for (const e of plan.schedule) {
        const m = TIME_RE.exec(e.time);
        if (!m || !validDays.has(e.day)) {
          console.warn(`Skip invalid entry: ${JSON.stringify(e)}`);
          skipped++;
          continue;
        }
        const [, start, end] = m;
        const key = [e.courseCode, e.day, start, end, e.room].join('|');
        if (seen.has(key)) continue; // ซ้ำข้ามแผนการเรียน
        seen.add(key);

        const startTime = toTimeDate(start);
        const endTime = toTimeDate(end);
        const day = e.day as DayOfWeek;

        const found = await prisma.schedule.findFirst({
          where: {
            courseCode: e.courseCode,
            roomName: e.room,
            day,
            startTime,
            endTime,
          },
        });
        if (found) {
          existing++;
          continue;
        }

        await prisma.schedule.create({
          data: {
            instructorName: DEFAULT_INSTRUCTOR,
            courseCode: e.courseCode,
            courseName: e.courseName,
            roomName: e.room,
            day,
            startTime,
            endTime,
          },
        });
        created++;
      }
    }
    console.log(
      `Schedules: created ${created}, already existed ${existing}, skipped ${skipped}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});