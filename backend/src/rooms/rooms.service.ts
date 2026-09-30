import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule, DayOfWeek } from '../entities/schedule.entity';

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
  ) {}

  async checkScheduleConflict(
    roomName: string,
    day: DayOfWeek,
    excludeScheduleId?: string,
  ) {
    const schedules = await this.scheduleRepository.find({
      where: {
        roomName,
        day,
      },
    });

    for (const schedule of schedules) {
      if (
        excludeScheduleId &&
        String(schedule.id) === String(excludeScheduleId)
      ) {
        continue;
      }
    }

    return schedules;
  }
}
