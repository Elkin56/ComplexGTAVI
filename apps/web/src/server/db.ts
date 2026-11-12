import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const g = globalThis as unknown as { __prisma?: PrismaClient };

/** Ленивое подключение: сборка и /api/health работают и без настроенной базы. */
export function db(): PrismaClient {
  if (!g.__prisma) {
    g.__prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }
  return g.__prisma;
}
