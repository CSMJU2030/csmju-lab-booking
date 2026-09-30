import { Controller, Get, Query } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { DayOfWeek } from '../entities/schedule.entity';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('check')
  async checkConflict(
    @Query('roomName') roomName: string,
    @Query('day') day: DayOfWeek,
    @Query('excludeId') excludeId?: string,
  ) {
    return await this.roomsService.checkScheduleConflict(
      roomName,
      day,
      excludeId,
    );
  }
}
