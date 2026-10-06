import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek, ReservationStatus } from '../../generated/prisma/client';
import { dayOfWeekOf } from '../common/bangkok-clock';
import { AppException } from '../common/errors';
import { fromTimeDate, toDateOnly } from '../prisma/time.util';
import * as rules from '../reservations/booking-rules';

const hhmm = (time: Date) => fromTimeDate(time).slice(0, 5);

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async checkScheduleConflict(
    roomName: string,
    day: DayOfWeek,
    excludeScheduleId?: string,
  ) {
    const schedules = await this.prisma.schedule.findMany({
      where: { roomName, day },
    });

    for (const schedule of schedules) {
      if (
        excludeScheduleId &&
        String(schedule.id) === String(excludeScheduleId)
      ) {
        continue;
      }
    }

    return schedules.map((s) => ({
      ...s,
      startTime: fromTimeDate(s.startTime),
      endTime: fromTimeDate(s.endTime),
    }));
  }

  /** ห้องทั้งหมดที่เปิดให้จอง */
  async listRooms() {
    const rooms = await this.prisma.room.findMany({ orderBy: { name: 'asc' } });
    return rooms.map((r) => ({ id: r.id, name: r.name, building: r.building }));
  }

  /**
   * ห้องไม่ว่างช่วงไหนบ้างในวันที่เลือก: คาบเรียนของวันนั้น และช่วงที่มีผู้จองแล้ว
   * (ไม่เปิดเผยว่าใครจอง) พร้อมกติกาการจองให้หน้าเว็บใช้แสดงผล
   */
  async availability(roomId: string, date: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw AppException.notFound('Room not found');
    }

    const { day, index } = dayOfWeekOf(date);
    const [schedules, roomSchedules, reservations] = await Promise.all([
      this.prisma.schedule.findMany({
        where: { roomName: room.name, day },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.roomSchedule.findMany({
        where: { roomId: room.id, dayOfWeek: index },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.reservation.findMany({
        where: { roomId: room.id, bookingDate: toDateOnly(date) },
        orderBy: { startTime: 'asc' },
      }),
    ]);

    // ตารางประจำ (room_schedules) กับตารางที่แสดงผล (schedules) อาจเป็นคาบเดียวกัน — ตัดตัวซ้ำออก
    const seen = new Set<string>();
    const classes = [
      ...schedules.map((s) => ({
        startTime: hhmm(s.startTime),
        endTime: hhmm(s.endTime),
        title: `${s.courseCode} ${s.courseName}`,
      })),
      ...roomSchedules.map((s) => ({
        startTime: hhmm(s.startTime),
        endTime: hhmm(s.endTime),
        title: s.subjectName ?? 'คาบเรียน',
      })),
    ].filter((c) => {
      const key = `${c.startTime}-${c.endTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const active: ReservationStatus[] = [
      ReservationStatus.PENDING,
      ReservationStatus.APPROVED,
    ];
    const bookings = reservations
      .filter((r) => active.includes(r.status))
      .map((r) => ({
        startTime: hhmm(r.startTime),
        endTime: hhmm(r.endTime),
        peopleCount: r.peopleCount,
      }));

    return {
      roomId: room.id,
      roomName: room.name,
      date,
      day,
      classes,
      bookings,
      rules: {
        open: rules.BOOKING_OPEN,
        close: rules.BOOKING_CLOSE,
        maxDaysAhead: rules.MAX_DAYS_AHEAD,
        maxPeoplePerBooking: rules.MAX_PEOPLE_PER_BOOKING,
        maxGroupsPerSlot: rules.MAX_GROUPS_PER_SLOT,
        maxPeoplePerSlot: rules.MAX_PEOPLE_PER_SLOT,
      },
    };
  }
}
