import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

interface SectionCourseRelation {
  course: {
    id: string;
  };
}

@Entity()
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  code!: string;

  @Column()
  nameTh!: string;

  @Column()
  credit!: string;

  @OneToMany('Section', (section: SectionCourseRelation) => section.course)
  sections!: SectionCourseRelation[];
}
