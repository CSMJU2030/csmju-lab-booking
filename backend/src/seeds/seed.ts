import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'lab_booking',
});

async function seed() {
  try {
    console.log('Database connected for seeding...');

    const initialRooms = [
      { name: 'Lab คอม 3', building: 'อาคารจุฬาภรณ์' },
      { name: 'Lab คอม 4', building: 'อาคารจุฬาภรณ์' },
      { name: 'Sci Digital Lab', building: 'อาคารจุฬาภรณ์' },
    ];

    for (const roomData of initialRooms) {
      // ตรวจสอบว่ามีห้องนี้อยู่หรือยัง
      const checkResult = await pool.query(
        'SELECT * FROM rooms WHERE name = $1',
        [roomData.name],
      );

      if (checkResult.rows.length === 0) {
        // ถ้ายังไม่มี ให้ INSERT ข้อมูลใหม่
        await pool.query(
          'INSERT INTO rooms (name, building) VALUES ($1, $2)',
          [roomData.name, roomData.building],
        );
        console.log(`Added room: ${roomData.name}`);
      } else {
        console.log(`Room already exists: ${roomData.name}`);
      }
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    await pool.end();
  }
}

void seed();