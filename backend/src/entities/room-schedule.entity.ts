import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Room } from './room.entity';

@Entity('room_schedules')
export class RoomSchedule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Room, 'schedules', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'room_id' })
  room!: Room;

  @Column({ type: 'int' })
  dayOfWeek!: number;

  @Column({ type: 'time' })
  startTime!: string;

  @Column({ type: 'time' })
  endTime!: string;

  @Column({ nullable: true })
  subjectName?: string;

  @Column({ nullable: true })
  academicYear?: string;
}
