import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

interface ScheduleRoomRelation {
  room: {
    id: string;
  };
}

@Entity()
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true })
  building?: string;

  @OneToMany('Schedule', (schedule: ScheduleRoomRelation) => schedule.room)
  schedules!: ScheduleRoomRelation[];
}
