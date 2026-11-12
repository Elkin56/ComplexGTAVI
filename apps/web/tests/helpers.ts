import { db } from '@/server/db';

export const hasDb = !!process.env.DATABASE_URL;

export async function resetDb() {
  const p = db();
  await p.$executeRawUnsafe(`TRUNCATE "ReminderLog","AuditLog","PurchaseClaim","Raffle","Ticket","Purchase","Admin","User" RESTART IDENTITY CASCADE`);
  await p.$executeRawUnsafe(`ALTER SEQUENCE ticket_number_seq RESTART WITH 1`);
}

export const mkUser = (telegramId: number, name = `User${telegramId}`, consent = true) =>
  db().user.create({ data: { telegramId: BigInt(telegramId), firstName: name, consentAt: consent ? new Date() : null, consentVersion: consent ? 'test' : null } });
export const mkAdmin = (telegramId: number, role: 'OWNER' | 'MANAGER' | 'STAFF' = 'OWNER') =>
  db().admin.create({ data: { telegramId: BigInt(telegramId), role } });
