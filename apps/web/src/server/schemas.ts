import { z } from 'zod';

export const category = z.enum(['PC', 'COMPONENTS', 'PERIPHERALS', 'OTHER']);
export const receipt = z.string().trim().min(1, 'Введите номер чека').max(40);
export const amount = z.coerce.number().positive('Сумма должна быть больше 0').max(100_000_000);
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Некорректная дата');
export const reason = z.string().trim().min(1, 'Укажите причину').max(300);
export const claimBody = z.object({ receiptNumber: receipt, amount, category, purchaseDate: dateStr });
