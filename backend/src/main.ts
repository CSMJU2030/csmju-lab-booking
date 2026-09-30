import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // กำหนด Global Prefix ตามมาตรฐานของรายวิชา
  app.setGlobalPrefix('api');

  // เปิดให้ Frontend (Next.js) เรียกใช้งาน API ได้
  app.enableCors();

  // กำหนดให้ใช้ PORT จากไฟล์ .env ถ้าไม่มีให้ใช้ 3003 เป็นค่าเริ่มต้น
  const port = process.env.PORT ?? 3003;
  await app.listen(port);
  console.log(`Subsystem Backend is running on: http://localhost:${port}`);
}

void bootstrap().catch((error) => {
  console.error('Failed to start the application:', error);
  process.exit(1);
});