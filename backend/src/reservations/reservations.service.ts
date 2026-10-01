import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationStatus } from '../../generated/prisma/client';
import {
  fromDateOnly,
  fromTimeDate,
  toDateOnly,
  toTimeDate,
} from '../prisma/time.util';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBooking(dto: {
    core_user_id: string;
    roomId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    purpose: string;
  }) {
    const { roomId, bookingDate } = dto;
    const startTime = toTimeDate(dto.startTime);
    const endTime = toTimeDate(dto.endTime);
    const dayOfWeek = new Date(bookingDate).getDay();

    // 1. เช็กตารางเรียนประจำ (วันเดียวกับ dayOfWeek และช่วงเวลาคาบเกี่ยวกัน)
    const isScheduleConflict = await this.prisma.roomSchedule.findFirst({
      where: {
        roomId,
        dayOfWeek,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (isScheduleConflict) {
      throw new BadRequestException(
        'ช่วงเวลานี้ตรงกับตารางเรียนประจำ ไม่สามารถจองได้',
      );
    }

    // 2. เช็กการจองที่มีอยู่แล้วในวันนั้น
    const isBookingConflict = await this.prisma.reservation.findFirst({
      where: {
        roomId,
        bookingDate: toDateOnly(bookingDate),
        status: {
          in: [ReservationStatus.PENDING, ReservationStatus.APPROVED],
        },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (isBookingConflict) {
      throw new BadRequestException(
        'ช่วงเวลานี้มีการจองค้างอยู่หรือได้รับการอนุมัติแล้ว',
      );
    }

    // 3. บันทึกการจอง
    const saved = await this.prisma.reservation.create({
      data: {
        coreUserId: dto.core_user_id,
        roomId,
        bookingDate: toDateOnly(bookingDate),
        startTime,
        endTime,
        purpose: dto.purpose,
      },
    });

    return this.serialize(saved);
  }

  async findAll() {
    const rows = await this.prisma.reservation.findMany({
      include: { room: true },
    });
    return rows.map((r) => this.serialize(r));
  }

  private serialize<
    T extends { bookingDate: Date; startTime: Date; endTime: Date },
  >(row: T) {
    return {
      ...row,
      bookingDate: fromDateOnly(row.bookingDate),
      startTime: fromTimeDate(row.startTime),
      endTime: fromTimeDate(row.endTime),
    };
  }
}
