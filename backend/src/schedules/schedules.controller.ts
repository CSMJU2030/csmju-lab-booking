import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { SchedulesService, Schedule } from './schedules.service';

@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post()
  async create(@Body() body: Partial<Schedule>): Promise<Schedule> {
    return await this.schedulesService.createSchedule(body);
  }

  @Get()
  async findAll(): Promise<Schedule[]> {
    return await this.schedulesService.getAllSchedules();
  }

  @Get('status')
  async getStatus() {
    return await this.schedulesService.getRoomStatuses();
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    await this.schedulesService.deleteSchedule(id);
  }
}
