import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { Permission } from '../auth/permissions';
import { CollectionResult } from '../common/api-response';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { QuerySchedulesDto } from './dto/query-schedules.dto';
import { SchedulesService } from './schedules.service';

@Controller('v1/schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post()
  @RequirePermissions(Permission.SCHEDULE_CREATE)
  create(@Body() dto: CreateScheduleDto) {
    return this.schedulesService.createSchedule(dto);
  }

  @Get()
  @RequirePermissions(Permission.SCHEDULE_READ)
  async findAll(@Query() query: QuerySchedulesDto) {
    const { items, total } = await this.schedulesService.getAllSchedules(query);
    return new CollectionResult(
      items,
      buildPaginationMeta(total, query.page ?? 1, query.take),
    );
  }

  @Get('status')
  @RequirePermissions(Permission.SCHEDULE_READ)
  async getStatus() {
    const rooms = await this.schedulesService.getRoomStatuses();
    return new CollectionResult(
      rooms,
      buildPaginationMeta(rooms.length, 1, rooms.length),
    );
  }

  @Delete(':id')
  @RequirePermissions(Permission.SCHEDULE_DELETE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedulesService.deleteSchedule(id);
  }
}
