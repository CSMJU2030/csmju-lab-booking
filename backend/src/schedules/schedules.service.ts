import { Injectable } from '@nestjs/common';
import { DayOfWeek, Prisma } from '../../generated/prisma/client';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { fromTimeDate, toTimeDate } from '../prisma/time.util';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { QuerySchedulesDto } from './dto/query-schedules.dto';

export interface Schedule {
  id: string;
  instructorName: string;
  courseCode: string;
  courseName: string;
  roomName: string;
  day: DayOfWeek;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomStatusResult {
  roomName: string;
  isOccupied: boolean;
  statusColor: 'red' | 'green';
  currentClass: {
    id: string;
    courseCode: string;
    courseName: string;
    instructorName: string;
    time: string;
  } | null;
  nextClass: {
    id: string;
    courseCode: string;
    courseName: string;
    instructorName: string;
    time: string;
    startTime: string;
  } | null;
  allSchedules: Schedule[];
}

/** เวลาท้องถิ่นของห้องแล็บ (ไม่ขึ้นกับ timezone ของเครื่อง/Docker ที่รัน backend) */
const LAB_TIME_ZONE = 'Asia/Bangkok';

const WEEKDAY_TO_ENUM: Record<string, DayOfWeek> = {
  Sunday: DayOfWeek.SUNDAY,
  Monday: DayOfWeek.MONDAY,
  Tuesday: DayOfWeek.TUESDAY,
  Wednesday: DayOfWeek.WEDNESDAY,
  Thursday: DayOfWeek.THURSDAY,
  Friday: DayOfWeek.FRIDAY,
  Saturday: DayOfWeek.SATURDAY,
};

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  private toSchedule(
    row: { startTime: Date; endTime: Date } & Omit<
      Schedule,
      'startTime' | 'endTime'
    >,
  ): Schedule {
    return {
      ...row,
      startTime: fromTimeDate(row.startTime),
      endTime: fromTimeDate(row.endTime),
    };
  }

  /** วันและนาทีที่ผ่านไปของวัน ตามเวลา Asia/Bangkok */
  private getBangkokNow(date: Date): { day: DayOfWeek; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: LAB_TIME_ZONE,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const get = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? '';

    const day = WEEKDAY_TO_ENUM[get('weekday')];
    if (!day) {
      throw new Error(`Unable to resolve weekday for ${date.toISOString()}`);
    }

    // บาง runtime คืน "24" ตอนเที่ยงคืน จึงใช้ % 24
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));

    return { day, minutes: hour * 60 + minute };
  }

  async createSchedule(dto: CreateScheduleDto): Promise<Schedule> {
    const startTime = toTimeDate(dto.startTime);
    const endTime = toTimeDate(dto.endTime);

    if (startTime >= endTime) {
      throw AppException.badRequest('startTime must be earlier than endTime');
    }

    const created = await this.prisma.schedule.create({
      data: {
        instructorName: dto.instructorName,
        courseCode: dto.courseCode,
        courseName: dto.courseName,
        roomName: dto.roomName,
        day: dto.day ?? DayOfWeek.MONDAY,
        startTime,
        endTime,
      },
    });

    return this.toSchedule(created);
  }

  async getAllSchedules(
    query: QuerySchedulesDto,
  ): Promise<{ items: Schedule[]; total: number }> {
    const where: Prisma.ScheduleWhereInput = {
      ...(query.roomName ? { roomName: query.roomName } : {}),
      ...(query.day ? { day: query.day } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        orderBy: { startTime: 'asc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toSchedule(row)),
      total,
    };
  }

  async deleteSchedule(id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.prisma.schedule.findUnique({ where: { id } });

    if (!existing) {
      throw AppException.notFound('Schedule not found');
    }

    await this.prisma.schedule.delete({ where: { id } });

    return { id, deleted: true };
  }

  async getRoomStatuses(): Promise<RoomStatusResult[]> {
    const { day: currentDay, minutes: currentMinutes } = this.getBangkokNow(
      new Date(),
    );

    const rows = await this.prisma.schedule.findMany({
      orderBy: { startTime: 'asc' },
    });

    const roomNames = Array.from(
      new Set(rows.map((row) => row.roomName)),
    ).sort();
    const allSchedulesByRoom = new Map<string, Schedule[]>();

    for (const row of rows) {
      const schedule = this.toSchedule(row);
      const roomSchedules = allSchedulesByRoom.get(schedule.roomName) ?? [];
      roomSchedules.push(schedule);
      allSchedulesByRoom.set(schedule.roomName, roomSchedules);
    }

    const result: RoomStatusResult[] = [];

    for (const roomName of roomNames) {
      const roomSchedules = allSchedulesByRoom.get(roomName) ?? [];
      const todaySchedules = roomSchedules.filter(
        (schedule) => schedule.day === currentDay,
      );
      // หน้าเว็บยังได้ตารางทั้งสัปดาห์ถ้าวันนี้ห้องว่าง (พฤติกรรมเดิม)
      const schedulesForRoom =
        todaySchedules.length > 0 ? todaySchedules : roomSchedules;

      let currentClass: RoomStatusResult['currentClass'] = null;
      let nextClass: RoomStatusResult['nextClass'] = null;

      // คำนวณสถานะจากคาบของ "วันนี้" เท่านั้น กัน nextClass เป็นคาบของวันอื่น
      for (const schedule of todaySchedules) {
        const [startH, startM] = schedule.startTime.split(':').map(Number);
        const [endH, endM] = schedule.endTime.split(':').map(Number);

        const startTotalMinutes = startH * 60 + startM;
        const endTotalMinutes = endH * 60 + endM;
        const isCurrentlyOngoing =
          currentMinutes >= startTotalMinutes &&
          currentMinutes < endTotalMinutes;

        if (isCurrentlyOngoing && !currentClass) {
          currentClass = {
            id: String(schedule.id),
            courseCode: schedule.courseCode,
            courseName: schedule.courseName,
            instructorName: schedule.instructorName,
            time: `${schedule.startTime} - ${schedule.endTime}`,
          };
        }

        if (startTotalMinutes > currentMinutes && !nextClass) {
          nextClass = {
            id: String(schedule.id),
            courseCode: schedule.courseCode,
            courseName: schedule.courseName,
            instructorName: schedule.instructorName,
            time: `${schedule.startTime} - ${schedule.endTime}`,
            startTime: schedule.startTime,
          };
        }
      }

      result.push({
        roomName,
        isOccupied: Boolean(currentClass),
        statusColor: currentClass ? 'red' : 'green',
        currentClass,
        nextClass,
        allSchedules: schedulesForRoom,
      });
    }

    return result;
  }
}