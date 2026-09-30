import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// แนบ datasource เฉพาะตอนมี DATABASE_URL จริง — กัน `prisma generate` (postinstall) ล้มตอนยังไม่มี .env
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
