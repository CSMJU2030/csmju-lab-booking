import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function seed() {
  const initialRooms = [
    { name: 'Lab คอม 3', building: 'อาคารจุฬาภรณ์' },
    { name: 'Lab คอม 4', building: 'อาคารจุฬาภรณ์' },
    { name: 'Sci Digital Lab', building: 'อาคารจุฬาภรณ์' },
  ];

  for (const roomData of initialRooms) {
    const exist = await prisma.room.findUnique({
      where: { name: roomData.name },
    });
    if (!exist) {
      await prisma.room.create({ data: roomData });
      console.log(`Added room: ${roomData.name}`);
    } else {
      console.log(`Room already exists: ${roomData.name}`);
    }
  }
  console.log('Seeding completed successfully!');
}

seed()
  .catch((error) => {
    console.error('Seeding error:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
