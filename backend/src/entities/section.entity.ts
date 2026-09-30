import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';

interface CourseSectionRelation {
  id: string;
  sections: Section[];
}

interface ScheduleSectionRelation {
  section: {
    id: string;
  };
}

@Entity()
export class Section {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  sectionNo!: number;

  @Column('simple-array')
  instructors!: string[];

  @Column()
  capacity!: number;

  @Column()
  enrolled!: number;

  @Column({ default: 'W' })
  status!: string;

  @ManyToOne('Course', (course: CourseSectionRelation) => course.sections)
  course!: CourseSectionRelation;

  @OneToMany(
    'Schedule',
    (schedule: ScheduleSectionRelation) => schedule.section,
  )
  schedules!: ScheduleSectionRelation[];
}
