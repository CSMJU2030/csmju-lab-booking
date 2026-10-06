import { Injectable } from '@nestjs/common';
import { ReservationStatus } from '../../generated/prisma/client';
import type { Prisma } from '../../generated/prisma/client';
import { can, Permission } from '../auth/permissions';
import type { CoreHubIdentity } from '../auth/core-hub-identity';
import { addDays, bangkokClock, dayOfWeekOf } from '../common/bangkok-clock';
import { AppException } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import {
  fromDateOnly,
  fromTimeDate,
  toDateOnly,
  toTimeDate,
} from '../prisma/time.util';
import {
  BOOKING_CLOSE,
  BOOKING_OPEN,
  MAX_DAYS_AHEAD,
  MAX_GROUPS_PER_SLOT,
  MAX_PEOPLE_PER_SLOT,
} from './booking-rules';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { QueryReservationsDto } from './dto/query-reservations.dto';

/** การจองที่ยังกินที่ห้องอยู่ */
const ACTIVE: ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.APPROVED,
];

export interface ReservationView {
  id: string;
  roomId: string;
  roomName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  peopleCount: number;
  purpose: string;
  status: ReservationStatus;
  createdAt: Date;
}

type TimeRange = { startTime: Date; endTime: Date };

const overlaps = (a: TimeRange, b: TimeRange) =>
  a.startTime.getTime() < b.endTime.getTime() &&
  b.startTime.getTime() < a.endTime.getTime();

const minutesOf = (time: Date) => time.getUTCHours() * 60 + time.getUTCMinutes();

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * จองห้องให้ผู้ใช้ที่ login อยู่ (core_user_id มาจาก token เสมอ ไม่รับจาก body)
   * ตรวจ: เวลาเปิดจอง · วันที่ไม่ย้อนหลัง/ไม่ไกลเกิน · ไม่ชนคาบเรียน ·
   * ห้องไม่เกินจำนวนกลุ่ม/คน · ผู้ใช้ไม่จองซ้อนตัวเอง
   */
  async create(
    user: CoreHubIdentity,
    dto: CreateReservationDto,
    now: Date = new Date(),
  ): Promise<ReservationView> {
    const startTime = toTimeDate(dto.startTime);
    const endTime = toTimeDate(dto.endTime);
    const slot: TimeRange = { startTime, endTime };

    if (startTime >= endTime) {
      throw AppException.badRequest('เวลาเริ่มต้องมาก่อนเวลาสิ้นสุด');
    }
    if (startTime < toTimeDate(BOOKING_OPEN) || endTime > toTimeDate(BOOKING_CLOSE)) {
      throw AppException.badRequest(
        `จองได้เฉพาะช่วง ${BOOKING_OPEN}–${BOOKING_CLOSE} น.`,
      );
    }

    const clock = bangkokClock(now);
    if (dto.bookingDate < clock.date) {
      throw AppException.badRequest('ไม่สามารถจองวันที่ผ่านมาแล้วได้');
    }
    if (dto.bookingDate > addDays(clock.date, MAX_DAYS_AHEAD)) {
      throw AppException.badRequest(
        `จองล่วงหน้าได้ไม่เกิน ${MAX_DAYS_AHEAD} วัน`,
      );
    }
    if (dto.bookingDate === clock.date && minutesOf(startTime) <= clock.minutes) {
      throw AppException.badRequest('เวลาเริ่มต้องอยู่หลังเวลาปัจจุบัน');
    }

    const room = await this.prisma.room.findUnique({ where: { id: dto.roomId } });
    if (!room) {
      throw AppException.notFound('Room not found');
    }

    const bookingDate = toDateOnly(dto.bookingDate);

    return this.prisma.$transaction(async (tx) => {
      // กันสองคำขอจองห้อง/วันเดียวกันพร้อมกันจนเกินโควตา (tech-stack.md ข้อ 1.4.1)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation:${room.id}:${dto.bookingDate}`}))`;

      const classes = await this.classesOn(tx, room, dto.bookingDate);
      const clash = classes.find((c) => overlaps(c, slot));
      if (clash) {
        throw AppException.conflict(
          `ช่วงเวลานี้ตรงกับคาบเรียน ${clash.label} (${fromTimeDate(clash.startTime).slice(0, 5)}–${fromTimeDate(clash.endTime).slice(0, 5)} น.)`,
        );
      }

      const sameSlot = (
        await tx.reservation.findMany({
          where: { roomId: room.id, bookingDate },
        })
      ).filter((r) => ACTIVE.includes(r.status) && overlaps(r, slot));

      if (sameSlot.some((r) => r.coreUserId === user.id)) {
        throw AppException.conflict('คุณจองห้องนี้ในช่วงเวลานี้ไว้แล้ว');
      }
      if (sameSlot.length >= MAX_GROUPS_PER_SLOT) {
        throw AppException.conflict(
          `ช่วงเวลานี้มีผู้จองครบ ${MAX_GROUPS_PER_SLOT} กลุ่มแล้ว`,
        );
      }
      const people = sameSlot.reduce((sum, r) => sum + r.peopleCount, 0);
      if (people + dto.peopleCount > MAX_PEOPLE_PER_SLOT) {
        throw AppException.conflict(
          `ห้องรับได้อีก ${MAX_PEOPLE_PER_SLOT - people} คนในช่วงเวลานี้`,
        );
      }

      const saved = await tx.reservation.create({
        data: {
          coreUserId: user.id,
          roomId: room.id,
          bookingDate,
          startTime,
          endTime,
          purpose: dto.purpose,
          peopleCount: dto.peopleCount,
          // ตรวจครบทุกกติกาแล้ว จึงยืนยันทันที (ยังไม่มีขั้นอนุมัติ)
          status: ReservationStatus.APPROVED,
        },
      });
      return this.toView(saved, room.name);
    });
  }

  /** การจองของตัวเอง หรือของทุกคน (scope=all ต้องมี reservation:read:any) */
  async list(
    user: CoreHubIdentity,
    query: QueryReservationsDto,
  ): Promise<{ items: ReservationView[]; total: number }> {
    const all = query.scope === 'all';
    if (all && !can(user.subsystemRole, Permission.RESERVATION_READ_ANY)) {
      throw AppException.forbidden();
    }

    const where: Prisma.ReservationWhereInput = all ? {} : { coreUserId: user.id };
    const [rows, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        orderBy: { bookingDate: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.reservation.count({ where }),
    ]);

    const roomNames = await this.roomNames(rows.map((r) => r.roomId));
    return {
      items: rows.map((r) => this.toView(r, roomNames.get(r.roomId) ?? '')),
      total,
    };
  }

  /** ยกเลิกการจอง: เจ้าของยกเลิกของตัวเองได้ ผู้มี reservation:delete:any ยกเลิกของใครก็ได้ */
  async remove(
    user: CoreHubIdentity,
    id: string,
  ): Promise<{ id: string; deleted: true }> {
    const existing = await this.prisma.reservation.findUnique({ where: { id } });
    if (!existing) {
      throw AppException.notFound('Reservation not found');
    }
    const isOwner = existing.coreUserId === user.id;
    if (!isOwner && !can(user.subsystemRole, Permission.RESERVATION_DELETE_ANY)) {
      throw AppException.forbidden();
    }
    await this.prisma.reservation.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** คาบเรียนของห้องในวันนั้น จากทั้งตารางที่อาจารย์เพิ่มเอง (schedules) และตารางประจำ (room_schedules) */
  private async classesOn(
    tx: Pick<PrismaService, 'schedule' | 'roomSchedule'>,
    room: { id: string; name: string },
    date: string,
  ): Promise<(TimeRange & { label: string })[]> {
    const { day, index } = dayOfWeekOf(date);
    const [schedules, roomSchedules] = await Promise.all([
      tx.schedule.findMany({ where: { roomName: room.name, day } }),
      tx.roomSchedule.findMany({ where: { roomId: room.id, dayOfWeek: index } }),
    ]);
    return [
      ...schedules.map((s) => ({ ...s, label: `${s.courseCode} ${s.courseName}` })),
      ...roomSchedules.map((s) => ({ ...s, label: s.subjectName ?? '' })),
    ];
  }

  private async roomNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const rooms = await Promise.all(
      unique.map((id) => this.prisma.room.findUnique({ where: { id } })),
    );
    return new Map(
      rooms.filter((r) => r !== null).map((r) => [r.id, r.name] as const),
    );
  }

  private toView(
    row: {
      id: string;
      roomId: string;
      bookingDate: Date;
      startTime: Date;
      endTime: Date;
      peopleCount: number;
      purpose: string;
      status: ReservationStatus;
      createdAt: Date;
    },
    roomName: string,
  ): ReservationView {
    return {
      id: row.id,
      roomId: row.roomId,
      roomName,
      bookingDate: fromDateOnly(row.bookingDate),
      startTime: fromTimeDate(row.startTime),
      endTime: fromTimeDate(row.endTime),
      peopleCount: row.peopleCount,
      purpose: row.purpose,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}
