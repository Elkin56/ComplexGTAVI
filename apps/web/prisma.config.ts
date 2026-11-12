import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Для `prisma generate` (например, при сборке Docker-образа) база не нужна, поэтому есть запасное значение.
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://user:pass@localhost:5432/db' },
});
