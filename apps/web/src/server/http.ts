import { ZodError } from 'zod';
import {
  AuthError, can, NotFoundError, OutOfPeriodError, RaffleClosedError, RaffleStateError, RateLimitError, ValidationError,
  type Permission,
} from '@complex/core';
import { authenticate, type Ctx } from './auth';
import { ConfigError } from './env';

export class ForbiddenError extends Error {}

const replacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);
export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, replacer), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export function toErrorResponse(e: unknown): Response {
  if (e instanceof ZodError) return json({ error: 'Некорректные данные', issues: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);
  if (e instanceof ValidationError) return json({ error: e.message }, 400);
  if (e instanceof AuthError) return json({ error: e.message }, 401);
  if (e instanceof ForbiddenError) return json({ error: e.message || 'Недостаточно прав' }, 403);
  if (e instanceof NotFoundError) return json({ error: e.message }, 404);
  if (e instanceof RaffleClosedError || e instanceof RaffleStateError) return json({ error: e.message }, 409);
  if (e instanceof OutOfPeriodError) return json({ error: e.message }, 422);
  if (e instanceof RateLimitError) return json({ error: e.message }, 429);
  if (e instanceof ConfigError) return json({ error: e.message }, 503);
  console.error('[api] unhandled', e);
  return json({ error: 'Внутренняя ошибка сервера' }, 500);
}

export interface RouteCtx { params: Promise<Record<string, string>> }
type Handler = (req: Request, a: Ctx, route: RouteCtx) => Promise<Response>;

/** Обёртка маршрута: авторизация по Telegram initData, проверка прав (RBAC) и единая обработка ошибок. */
export function api(handler: Handler, opts: { perm?: Permission; admin?: boolean } = {}) {
  return async (req: Request, route: RouteCtx = { params: Promise.resolve({}) }): Promise<Response> => {
    try {
      const ctx = await authenticate(req);
      if (opts.perm || opts.admin) {
        if (!ctx.admin) throw new ForbiddenError('Нужны права администратора');
        if (opts.perm && !can(ctx.admin.role, opts.perm)) throw new ForbiddenError('Недостаточно прав для этого действия');
      }
      return await handler(req, ctx, route);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

/** Маршрут без авторизации пользователя (вебхук, cron, health): защита своими секретами внутри. */
export function open(handler: (req: Request, route: RouteCtx) => Promise<Response>) {
  return async (req: Request, route: RouteCtx = { params: Promise.resolve({}) }): Promise<Response> => {
    try { return await handler(req, route); } catch (e) { return toErrorResponse(e); }
  };
}

export const intParam = (v: string | undefined, name = 'id'): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ValidationError(`Некорректный ${name}`);
  return n;
};

export function need(ctx: Ctx, perm: Permission): NonNullable<Ctx['admin']> {
  if (!ctx.admin || !can(ctx.admin.role, perm)) throw new ForbiddenError('Недостаточно прав для этого действия');
  return ctx.admin;
}
