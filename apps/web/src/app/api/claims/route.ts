import { ValidationError } from '@complex/core';
import { api, json } from '@/server/http';
import { claimBody } from '@/server/schemas';
import { submitClaimService } from '@/server/services';
import { readPhoto } from '@/server/uploads';

/** Пользователь отправляет чек. Билеты здесь не выдаются: их выдаёт сервер после проверки. */
export const POST = api(async (req, { user }) => {
  if (Number(req.headers.get('content-length') ?? 0) > 6 * 1024 * 1024) throw new ValidationError('Слишком большой запрос');
  const fd = await req.formData();
  const body = claimBody.parse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')));
  const file = fd.get('photo');
  const photo = file instanceof File && file.size > 0 ? await readPhoto(file) : undefined;
  const r = await submitClaimService(user, { ...body, photo });
  if (r.status === 'duplicate') return json({ error: 'Этот чек уже зарегистрирован или ожидает проверки' }, 409);
  return json(r, 201);
});
