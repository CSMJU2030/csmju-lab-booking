import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { Reservation } from '../entities/reservation.entity';
import { RoomSchedule } from '../entities/room-schedule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, RoomSchedule])],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
