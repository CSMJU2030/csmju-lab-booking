import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { DayOfWeek } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class QuerySchedulesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  roomName?: string;

  @IsOptional()
  @IsEnum(DayOfWeek)
  day?: DayOfWeek;
}
