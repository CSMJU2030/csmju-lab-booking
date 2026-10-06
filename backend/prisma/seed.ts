import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { toTimeDate } from '../src/prisma/time.util';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Day = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';

// ---------- ห้อง ----------
const LAB2 = 'Lab คอม 2';
const LAB3 = 'Lab คอม 3';
const LAB4 = 'Lab คอม 4';
const LAB5 = 'Lab คอม 5';
const SDL = 'Sci Digital Lab';
const CHULA_3203 = 'จุฬา 3203';
const LECTURE6 = 'บรรยายคอม 6';
const LECTURE7 = 'บรรยายคอม 7';
const LECTURE8 = 'บรรยายคอม 8';
const MATH_LAB4 = 'Lab คณิต 4';
const SCI_2105 = 'วิทย์ 2105';

// "Labcom 3-4" ในตารางเรียน = ใช้ทั้ง Lab คอม 3 และ Lab คอม 4 พร้อมกัน
const LAB34 = [LAB3, LAB4];

const ROOMS = [
  { name: LAB2, building: 'อาคารจุฬาภรณ์' },
  { name: LAB3, building: 'อาคารจุฬาภรณ์' },
  { name: LAB4, building: 'อาคารจุฬาภรณ์' },
  { name: LAB5, building: 'อาคารจุฬาภรณ์' },
  { name: SDL, building: 'อาคารจุฬาภรณ์' },
  { name: CHULA_3203, building: 'อาคารจุฬาภรณ์' },
  // TODO: ตรวจชื่ออาคารของห้องด้านล่างอีกครั้ง
  { name: LECTURE6, building: 'อาคารจุฬาภรณ์' },
  { name: LECTURE7, building: 'อาคารจุฬาภรณ์' },
  { name: LECTURE8, building: 'อาคารจุฬาภรณ์' },
  { name: MATH_LAB4, building: 'อาคารวิทยาศาสตร์' },
  { name: SCI_2105, building: 'อาคารวิทยาศาสตร์' },
];

// ---------- ตารางเรียน ----------
interface ClassSeed {
  rooms: string[];
  day: Day;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
}

/** คาบบรรยาย */
function lecture(
  rooms: string | string[],
  day: Day,
  startTime: string,
  endTime: string,
  courseCode: string,
  courseName: string,
): ClassSeed {
  return {
    rooms: Array.isArray(rooms) ? rooms : [rooms],
    day,
    startTime,
    endTime,
    courseCode,
    courseName,
  };
}

/** คาบปฏิบัติ (Lab) */
function lab(...args: Parameters<typeof lecture>): ClassSeed {
  const seed = lecture(...args);
  return { ...seed, courseName: `${seed.courseName} (ปฏิบัติ)` };
}

// ชั้นปีที่ 1 (แผน 1 และแผน 2 เรียนวิชาเอกพร้อมกัน)
const YEAR_1: ClassSeed[] = [
  lecture(
    LAB34,
    'TUESDAY',
    '09:30',
    '11:30',
    '10301111',
    'การเขียนโปรแกรมเบื้องต้น',
  ),
  lab(
    LAB34,
    'WEDNESDAY',
    '09:00',
    '12:00',
    '10301111',
    'การเขียนโปรแกรมเบื้องต้น',
  ),
  lecture(
    CHULA_3203,
    'TUESDAY',
    '12:30',
    '14:30',
    '10301112',
    'เทคโนโลยีสารสนเทศและการสื่อสาร',
  ),
  lab(
    LAB34,
    'FRIDAY',
    '10:00',
    '13:00',
    '10301112',
    'เทคโนโลยีสารสนเทศและการสื่อสาร',
  ),

  // แคลคูลัส กลุ่ม 1 (แผน 1)
  lecture(
    MATH_LAB4,
    'TUESDAY',
    '14:30',
    '16:00',
    '10305108',
    'แคลสำหรับวิทย์ กลุ่ม 1',
  ),
  lecture(
    MATH_LAB4,
    'FRIDAY',
    '14:30',
    '16:00',
    '10305108',
    'แคลสำหรับวิทย์ กลุ่ม 1',
  ),
  // แคลคูลัส กลุ่ม 2 (แผน 2)
  lecture(
    SCI_2105,
    'TUESDAY',
    '08:00',
    '09:30',
    '10305108',
    'แคลสำหรับวิทย์ กลุ่ม 2',
  ),
  lecture(
    SCI_2105,
    'FRIDAY',
    '08:00',
    '09:30',
    '10305108',
    'แคลสำหรับวิทย์ กลุ่ม 2',
  ),
];

// ชั้นปีที่ 2 รหัส 68 (แผน 1 และแผน 2 เรียนวิชาเอกพร้อมกัน)
const YEAR_2: ClassSeed[] = [
  lecture(CHULA_3203, 'TUESDAY', '08:30', '10:00', '10301211', 'คณิตคอมฯ'),
  lecture(CHULA_3203, 'FRIDAY', '08:30', '10:00', '10301211', 'คณิตคอมฯ'),

  lecture(
    LAB34,
    'TUESDAY',
    '15:00',
    '17:00',
    '10301222',
    'โครงสร้างข้อมูลและอัลกอริทึม',
  ),
  lab(
    CHULA_3203,
    'WEDNESDAY',
    '09:00',
    '12:00',
    '10301222',
    'โครงสร้างข้อมูลและอัลกอริทึม',
  ),

  lecture(
    LAB34,
    'TUESDAY',
    '13:00',
    '15:00',
    '10301223',
    'ฐานข้อมูลโครงสร้างเชิงสัมพันธ์',
  ),
  lab(
    LAB34,
    'THURSDAY',
    '09:00',
    '12:00',
    '10301223',
    'ฐานข้อมูลโครงสร้างเชิงสัมพันธ์',
  ),

  lecture(LAB34, 'MONDAY', '13:00', '15:00', '10301225', 'วิศวกรรมซอฟต์แวร์'),
  lab(LAB34, 'FRIDAY', '13:00', '16:00', '10301225', 'วิศวกรรมซอฟต์แวร์'),

  lecture(
    CHULA_3203,
    'THURSDAY',
    '13:00',
    '15:00',
    '10301231',
    'เว็บเทคโนโลยี',
  ),
  lab(LAB34, 'MONDAY', '09:00', '12:00', '10301231', 'เว็บเทคโนโลยี'),
];

// ชั้นปีที่ 3 รหัส 67 แผนเอกเลือก 1
const YEAR_3_TRACK_1: ClassSeed[] = [
  lecture(
    LECTURE6,
    'MONDAY',
    '10:00',
    '12:00',
    '10301351',
    'วิทยาการข้อมูล กลุ่ม 2',
  ),
  lab(LAB2, 'TUESDAY', '13:00', '16:00', '10301351', 'วิทยาการข้อมูล กลุ่ม 2'),

  lecture(
    LAB2,
    'MONDAY',
    '13:00',
    '15:00',
    '10301364',
    'ตรรกศาสตร์เชิงดิจิทัลฯ',
  ),
  lab(LAB2, 'THURSDAY', '09:00', '12:00', '10301364', 'ตรรกศาสตร์เชิงดิจิทัลฯ'),

  lecture(CHULA_3203, 'TUESDAY', '10:00', '12:00', '10301371', 'ปัญญาประดิษฐ์'),
  lab(LAB2, 'FRIDAY', '13:00', '16:00', '10301371', 'ปัญญาประดิษฐ์'),

  lecture(
    LECTURE8,
    'THURSDAY',
    '13:00',
    '15:00',
    '10301374',
    'การประมวลผลภาษาธรรมชาติ',
  ),
  lab(LAB2, 'FRIDAY', '09:00', '12:00', '10301374', 'การประมวลผลภาษาธรรมชาติ'),
];

// ชั้นปีที่ 3 รหัส 67 แผนเอกเลือก 2
const YEAR_3_TRACK_2: ClassSeed[] = [
  lecture(
    LAB2,
    'MONDAY',
    '10:00',
    '12:00',
    '10301341',
    'การเข้ารหัสฯ ในเครือข่าย',
  ),
  lab(
    LAB2,
    'TUESDAY',
    '09:00',
    '12:00',
    '10301341',
    'การเข้ารหัสฯ ในเครือข่าย',
  ),

  lecture(
    LECTURE8,
    'MONDAY',
    '13:00',
    '15:00',
    '10301314',
    'หลักการเขียนโปรแกรมเชิงวัตถุ',
  ),
  lab(
    LECTURE6,
    'FRIDAY',
    '09:00',
    '12:00',
    '10301314',
    'หลักการเขียนโปรแกรมเชิงวัตถุ',
  ),

  lecture(
    LECTURE6,
    'MONDAY',
    '15:00',
    '17:00',
    '10301385',
    'บริหารสารสนเทศฯการจัดการ',
  ),
  lab(
    LECTURE6,
    'THURSDAY',
    '14:00',
    '17:00',
    '10301385',
    'บริหารสารสนเทศฯการจัดการ',
  ),

  lecture(
    LECTURE6,
    'TUESDAY',
    '13:00',
    '15:00',
    '10301391',
    'หัวข้อพิเศษทางวิทยาการคอมพิวเตอร์ 1',
  ),
  lab(
    LECTURE6,
    'THURSDAY',
    '10:00',
    '13:00',
    '10301391',
    'หัวข้อพิเศษทางวิทยาการคอมพิวเตอร์ 1',
  ),
];

// ชั้นปีที่ 4 รหัส 66 (สัมมนาเรียนร่วมกันทั้งสองแผน)
const YEAR_4: ClassSeed[] = [
  lecture(
    LECTURE8,
    'MONDAY',
    '09:00',
    '12:00',
    '10301491',
    'สัมมนาทางวิทยาการคอมพิวเตอร์',
  ),

  // แผนเอกเลือก 1
  lecture(
    LECTURE7,
    'MONDAY',
    '13:00',
    '15:00',
    '10301342',
    'การประมวลผลแบบกลุ่มเมฆ',
  ),
  lab(
    LAB2,
    'WEDNESDAY',
    '09:00',
    '12:00',
    '10301342',
    'การประมวลผลแบบกลุ่มเมฆ',
  ),

  // แผนเอกเลือก 2
  lecture(LAB5, 'MONDAY', '13:00', '15:00', '10301366', 'วิทยาการสมองกลฝังตัว'),
  lab(LAB5, 'TUESDAY', '10:00', '13:00', '10301366', 'วิทยาการสมองกลฝังตัว'),
];

const CLASSES: ClassSeed[] = [
  ...YEAR_1,
  ...YEAR_2,
  ...YEAR_3_TRACK_1,
  ...YEAR_3_TRACK_2,
  ...YEAR_4,
];

// แตก 1 คาบที่ใช้หลายห้อง (เช่น Labcom 3-4) ออกเป็นรายการละ 1 ห้อง
const SCHEDULES = CLASSES.flatMap(({ rooms, ...rest }) =>
  rooms.map((roomName) => ({ roomName, ...rest })),
);

// ตาราง schedules ยังบังคับ instructor_name แต่ตารางเรียนไม่ได้ระบุชื่ออาจารย์
// TODO: ใส่ชื่ออาจารย์จริงเมื่อมีข้อมูล
const INSTRUCTOR_TBA = 'ยังไม่ระบุ';

// ภาคเรียนที่ 1 ปีการศึกษา 2569
const ACADEMIC_YEAR = '2569/1';

// ตรงกับ Date.getDay() ที่ ReservationsService ใช้ (0 = อาทิตย์, 1 = จันทร์)
const DAY_INDEX: Record<Day, number> = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
};

// รันพร้อม --reset เพื่อลบตารางเรียนเดิม (schedules + room_schedules) ก่อน seed (ไม่แตะห้องและการจอง)
const RESET_SCHEDULES = process.argv.includes('--reset');

async function seed() {
  console.log('Database connected for seeding...');

  const roomIds = new Map<string, string>();
  for (const roomData of ROOMS) {
    let room = await prisma.room.findUnique({
      where: { name: roomData.name },
    });
    if (!room) {
      room = await prisma.room.create({ data: roomData });
      console.log(`Added room: ${roomData.name}`);
    } else {
      console.log(`Room already exists: ${roomData.name}`);
    }
    roomIds.set(roomData.name, room.id);
  }

  if (RESET_SCHEDULES) {
    const { count } = await prisma.schedule.deleteMany();
    const rs = await prisma.roomSchedule.deleteMany();
    console.log(`Deleted ${count} old schedules, ${rs.count} room schedules`);
  }

  console.log(`Seeding ${SCHEDULES.length} schedules...`);

  let created = 0;
  for (const sch of SCHEDULES) {
    const startTime = toTimeDate(sch.startTime);
    const endTime = toTimeDate(sch.endTime);

    const existingSchedule = await prisma.schedule.findFirst({
      where: {
        roomName: sch.roomName,
        day: sch.day,
        startTime,
        courseCode: sch.courseCode,
      },
    });

    if (!existingSchedule) {
      await prisma.schedule.create({
        data: {
          roomName: sch.roomName,
          day: sch.day,
          startTime,
          endTime,
          courseCode: sch.courseCode,
          courseName: sch.courseName,
          instructorName: INSTRUCTOR_TBA,
        },
      });
      created++;
    }
  }
  console.log(`Created ${created} new schedules`);

  // room_schedules ใช้ตรวจว่าการจองชนกับคาบเรียนหรือไม่ (ReservationsService)
  let createdRoomSchedules = 0;
  for (const sch of SCHEDULES) {
    const roomId = roomIds.get(sch.roomName);
    if (!roomId) continue;

    const dayOfWeek = DAY_INDEX[sch.day];
    const startTime = toTimeDate(sch.startTime);

    const existing = await prisma.roomSchedule.findFirst({
      where: { roomId, dayOfWeek, startTime },
    });

    if (!existing) {
      await prisma.roomSchedule.create({
        data: {
          roomId,
          dayOfWeek,
          startTime,
          endTime: toTimeDate(sch.endTime),
          subjectName: `${sch.courseCode} ${sch.courseName}`,
          academicYear: ACADEMIC_YEAR,
        },
      });
      createdRoomSchedules++;
    }
  }
  console.log(`Created ${createdRoomSchedules} new room schedules`);

  console.log('Seeding completed successfully with all schedules!');
}

seed()
  .catch((error) => {
    console.error('Seeding error:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
