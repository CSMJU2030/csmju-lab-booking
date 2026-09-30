import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from '../entities/schedule.entity';

export interface RoomStatusResult {
  roomName: string;
  isOccupied: boolean;
  statusColor: 'red' | 'green';
  currentClass: {
    id: string;
    courseCode: string;
    courseName: string;
    instructorName: string;
    time: string;
  } | null;
  nextClass: {
    id: string;
    courseCode: string;
    courseName: string;
    instructorName: string;
    time: string;
    startTime: string;
  } | null;
  allSchedules: Schedule[];
}

@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(Schedule)
    private readonly scheduleRepository: Repository<Schedule>,
  ) {}

  async createSchedule(data: Partial<Schedule>): Promise<Schedule> {
    const newSchedule = this.scheduleRepository.create(data);
    return await this.scheduleRepository.save(newSchedule);
  }

  async getAllSchedules(): Promise<Schedule[]> {
    return await this.scheduleRepository.find({
      order: { startTime: 'ASC' },
    });
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.scheduleRepository.delete(id);
  }

  async getRoomStatuses(): Promise<RoomStatusResult[]> {
    const roomNames = ['lab1', 'lab2', 'lab3'];
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const result: RoomStatusResult[] = [];

    for (const roomName of roomNames) {
      const schedules = await this.scheduleRepository.find({
        where: { roomName },
        order: { startTime: 'ASC' },
      });

      let currentClass: RoomStatusResult['currentClass'] = null;
      let nextClass: RoomStatusResult['nextClass'] = null;

      for (const s of schedules) {
        const [startH, startM] = s.startTime.split(':').map(Number);
        const [endH, endM] = s.endTime.split(':').map(Number);

        const startTotalMinutes = startH * 60 + startM;
        const endTotalMinutes = endH * 60 + endM;

        const isCurrentlyOngoing =
          currentMinutes >= startTotalMinutes &&
          currentMinutes < endTotalMinutes;

        if (isCurrentlyOngoing) {
          currentClass = {
            id: String(s.id),
            courseCode: s.courseCode,
            courseName: s.courseName,
            instructorName: s.instructorName,
            time: `${s.startTime} - ${s.endTime}`,
          };
        }

        if (startTotalMinutes > currentMinutes && !nextClass) {
          nextClass = {
            id: String(s.id),
            courseCode: s.courseCode,
            courseName: s.courseName,
            instructorName: s.instructorName,
            time: `${s.startTime} - ${s.endTime}`,
            startTime: s.startTime,
          };
        }
      }

      result.push({
        roomName,
        isOccupied: Boolean(currentClass),
        statusColor: currentClass ? 'red' : 'green',
        currentClass,
        nextClass,
        allSchedules: schedules,
      });
    }

    return result;
  }
}
