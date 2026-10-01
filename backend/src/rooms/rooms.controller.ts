import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CheckRoomDto } from './dto/check-room.dto';
import { RoomsService } from './rooms.service';

@Controller('v1/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get('check')
  @RequirePermissions(Permission.ROOM_READ)
  async checkConflict(@Query() query: CheckRoomDto) {
    const schedules = await this.roomsService.checkScheduleConflict(
      query.roomName,
      query.day,
      query.excludeId,
    );
    return new CollectionResult(
      schedules,
      buildPaginationMeta(schedules.length, 1, schedules.length),
    );
  }
}
