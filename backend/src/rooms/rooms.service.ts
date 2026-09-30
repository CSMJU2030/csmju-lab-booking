import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '../generated/prisma/client';
import { fromTimeDate } from '../prisma/time.util';

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async checkScheduleConflict(
    roomName: string,
    day: DayOfWeek,
    excludeScheduleId?: string,
  ) {
    const schedules = await this.prisma.schedule.findMany({
      where: { roomName, day },
    });

    for (const schedule of schedules) {
      if (
        excludeScheduleId &&
        String(schedule.id) === String(excludeScheduleId)
      ) {
        continue;
      }
    }

    return schedules.map((s) => ({
      ...s,
      startTime: fromTimeDate(s.startTime),
      endTime: fromTimeDate(s.endTime),
    }));
  }
}
