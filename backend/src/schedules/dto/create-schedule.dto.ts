import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { DayOfWeek } from '../../../generated/prisma/client';
import { IsTimeOfDay } from '../../common/dto/time-of-day';

export class CreateScheduleDto {
  @IsString()
  @Length(1, 200)
  instructorName!: string;

  @IsString()
  @Length(1, 50)
  courseCode!: string;

  @IsString()
  @Length(1, 200)
  courseName!: string;

  @IsString()
  @Length(1, 100)
  roomName!: string;

  @IsOptional()
  @IsEnum(DayOfWeek)
  day?: DayOfWeek;

  @IsTimeOfDay()
  startTime!: string;

  @IsTimeOfDay()
  endTime!: string;
}
