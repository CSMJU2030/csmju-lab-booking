import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reservation, ReservationStatus } from '../entities/reservation.entity';
import { RoomSchedule } from '../entities/room-schedule.entity';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private reservationRepo: Repository<Reservation>,
    @InjectRepository(RoomSchedule)
    private scheduleRepo: Repository<RoomSchedule>,
  ) {}

  async createBooking(dto: {
    userId: string;
    roomId: string;
    bookingDate: string;
    startTime: string;
    endTime: string;
    purpose: string;
  }) {
    const { roomId, bookingDate, startTime, endTime } = dto;
    const dayOfWeek = new Date(bookingDate).getDay();

    // 1. เช็กตารางเรียนประจำ (วันเดียวกับ dayOfWeek และช่วงเวลาคาบเกี่ยวกัน)
    const isScheduleConflict = await this.scheduleRepo
      .createQueryBuilder('sch')
      .where('sch.room_id = :roomId', { roomId })
      .andWhere('sch.dayOfWeek = :dayOfWeek', { dayOfWeek })
      .andWhere('sch.startTime < :endTime AND sch.endTime > :startTime', {
        startTime,
        endTime,
      })
      .getOne();

    if (isScheduleConflict) {
      throw new BadRequestException(
        'ช่วงเวลานี้ตรงกับตารางเรียนประจำ ไม่สามารถจองได้',
      );
    }

    // 2. เช็กการจองที่มีอยู่แล้วในวันนั้น
    const isBookingConflict = await this.reservationRepo
      .createQueryBuilder('res')
      .where('res.room_id = :roomId', { roomId })
      .andWhere('res.bookingDate = :bookingDate', { bookingDate })
      .andWhere('res.status IN (:...statuses)', {
        statuses: [ReservationStatus.PENDING, ReservationStatus.APPROVED],
      })
      .andWhere('res.startTime < :endTime AND res.endTime > :startTime', {
        startTime,
        endTime,
      })
      .getOne();

    if (isBookingConflict) {
      throw new BadRequestException(
        'ช่วงเวลานี้มีการจองค้างอยู่หรือได้รับการอนุมัติแล้ว',
      );
    }

    // 3. บันทึกการจอง
    const reservation = this.reservationRepo.create({
      userId: dto.userId,
      room: { id: roomId },
      bookingDate,
      startTime,
      endTime,
      purpose: dto.purpose,
    });

    return this.reservationRepo.save(reservation);
  }

  findAll() {
    return this.reservationRepo.find({ relations: { room: true } });
  }
}
