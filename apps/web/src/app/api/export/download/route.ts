import { AuthError, can, verifyToken } from '@complex/core';
import { db } from '@/server/db';
import { env } from '@/server/env';
import { buildExport, type ExportFormat, type ExportKind } from '@/server/exporter';
import { open } from '@/server/http';

export const dynamic = 'force-dynamic';

/** Скачивание по короткоживущей подписанной ссылке (её выдаёт POST /api/admin/export). Права проверяются повторно. */
export const GET = open(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  const p = verifyToken<{ kind: ExportKind; format: ExportFormat; adminId: number }>(token, env().WEBHOOK_SECRET);
  const admin = await db().admin.findUnique({ where: { id: p.adminId } });
  if (!admin || !can(admin.role, 'export')) throw new AuthError('Нет доступа');
  const f = await buildExport(p.kind, p.format);
  await db().auditLog.create({ data: { adminId: admin.id, action: 'EXPORT_DOWNLOADED', details: { kind: p.kind, format: p.format } } });
  return new Response(f.body as BodyInit, { headers: { 'content-type': f.contentType, 'content-disposition': `attachment; filename="${f.filename}"`, 'cache-control': 'no-store' } });
});
