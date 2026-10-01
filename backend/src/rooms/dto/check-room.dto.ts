import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { DayOfWeek } from '../../../generated/prisma/client';

export class CheckRoomDto {
  @IsString()
  @Length(1, 100)
  roomName!: string;

  @IsEnum(DayOfWeek)
  day!: DayOfWeek;

  @IsOptional()
  @IsUUID()
  excludeId?: string;
}
