import { IsCalendarDate } from '../../common/dto/calendar-date';

export class RoomAvailabilityDto {
  /** YYYY-MM-DD (เวลาไทย) */
  @IsCalendarDate()
  date!: string;
}
