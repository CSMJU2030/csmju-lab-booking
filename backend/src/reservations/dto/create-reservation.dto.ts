import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../common/dto/calendar-date';
import { IsTimeOfDay } from '../../common/dto/time-of-day';
import { MAX_PEOPLE_PER_BOOKING } from '../booking-rules';

export class CreateReservationDto {
  @IsUUID()
  roomId!: string;

  /** วันที่ต้องการใช้ห้อง รูปแบบ YYYY-MM-DD (เวลาไทย) */
  @IsCalendarDate()
  bookingDate!: string;

  @IsTimeOfDay()
  startTime!: string;

  @IsTimeOfDay()
  endTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PEOPLE_PER_BOOKING)
  peopleCount!: number;

  @IsString()
  @Length(1, 200)
  purpose!: string;
}
