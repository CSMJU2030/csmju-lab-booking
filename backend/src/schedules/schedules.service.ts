import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '../generated/prisma/client';
import { fromTimeDate, toTimeDate } from '../prisma/time.util';

// รูปแบบที่ API ส่งออก/รับเข้า — เวลาเป็น string "HH:MM:SS" เหมือนเดิม
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

  async createSchedule(data: Partial<Schedule>): Promise<Schedule> {
    const created = await this.prisma.schedule.create({
      data: {
        instructorName: data.instructorName as string,
        courseCode: data.courseCode as string,
        courseName: data.courseName as string,
        roomName: data.roomName as string,
        day: data.day,
        startTime: toTimeDate(data.startTime as string),
        endTime: toTimeDate(data.endTime as string),
      },
    });
    return this.toSchedule(created);
  }

  async getAllSchedules(): Promise<Schedule[]> {
    const rows = await this.prisma.schedule.findMany({
      orderBy: { startTime: 'asc' },
    });
    return rows.map((r) => this.toSchedule(r));
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.prisma.schedule.deleteMany({ where: { id } });
  }

  async getRoomStatuses(): Promise<RoomStatusResult[]> {
    const roomNames = ['lab1', 'lab2', 'lab3'];
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const result: RoomStatusResult[] = [];

    for (const roomName of roomNames) {
      const schedules = (
        await this.prisma.schedule.findMany({
          where: { roomName },
          orderBy: { startTime: 'asc' },
        })
      ).map((r) => this.toSchedule(r));

      let currentClass: RoomStatusResult['currentClass'] = null;
      let nextClass: RoomStatusResult['nextClass'] = null;

      for (const s of schedules) {
        const [startH, startM] = s.startTime.split(':').map(Number);
        const [endH, endM] = s.endTime.split(':').map(Number);

        const startTotalMinutes = startH * 60 + startM;
        const endTotalMinutes = endH * 60 + endM;

        const isCurrentlyOngoing =
          currentMinutes >= startTotalMinutes &&
          currentMinutes < endTotalMinutes;

        if (isCurrentlyOngoing) {
          currentClass = {
            id: String(s.id),
            courseCode: s.courseCode,
            courseName: s.courseName,
            instructorName: s.instructorName,
            time: `${s.startTime} - ${s.endTime}`,
          };
        }

        if (startTotalMinutes > currentMinutes && !nextClass) {
          nextClass = {
            id: String(s.id),
            courseCode: s.courseCode,
            courseName: s.courseName,
            instructorName: s.instructorName,
            time: `${s.startTime} - ${s.endTime}`,
            startTime: s.startTime,
          };
        }
      }

      result.push({
        roomName,
        isOccupied: Boolean(currentClass),
        statusColor: currentClass ? 'red' : 'green',
        currentClass,
        nextClass,
        allSchedules: schedules,
      });
    }

    return result;
  }
}
