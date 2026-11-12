import { z } from 'zod';
import { api, intParam, json } from '@/server/http';
import { reason } from '@/server/schemas';
import { cancelService } from '@/server/services';

export const POST = api(async (req, ctx, route) => {
  const { id } = await route.params;
  const b = z.object({ reason }).parse(await req.json());
  const r = await cancelService(ctx.admin!, intParam(id), b.reason);
  return json({ status: r.status, voided: r.voided.map((t) => t.ticketNumber) });
}, { perm: 'purchases.cancel' });
