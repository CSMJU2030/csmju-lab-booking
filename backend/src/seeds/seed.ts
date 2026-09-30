import { DataSource } from 'typeorm';
import { Room } from '../entities/room.entity';
import { Course } from '../entities/course.entity';
import { Section } from '../entities/section.entity';
import { Schedule } from '../entities/schedule.entity';

const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'lab_booking',
  entities: [Room, Course, Section, Schedule],
  synchronize: true,
});

async function seed() {
  try {
    await AppDataSource.initialize();
    console.log('Database connected for seeding...');

    const roomRepository = AppDataSource.getRepository(Room);

    const initialRooms = [
      { name: 'Lab คอม 3', building: 'อาคารจุฬาภรณ์' },
      { name: 'Lab คอม 4', building: 'อาคารจุฬาภรณ์' },
      { name: 'Sci Digital Lab', building: 'อาคารจุฬาภรณ์' },
    ];

    for (const roomData of initialRooms) {
      const exist = await roomRepository.findOneBy({ name: roomData.name });
      if (!exist) {
        const room = roomRepository.create(roomData);
        await roomRepository.save(room);
        console.log(`Added room: ${roomData.name}`);
      } else {
        console.log(`Room already exists: ${roomData.name}`);
      }
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

void seed();
