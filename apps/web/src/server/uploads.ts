import { ValidationError } from '@complex/core';

const MAX = 4 * 1024 * 1024;

/** Проверка фото чека: размер и реальный формат по сигнатуре файла (а не по расширению или Content-Type). */
export async function readPhoto(file: File): Promise<{ data: Uint8Array<ArrayBuffer>; mime: string }> {
  if (file.size === 0) throw new ValidationError('Пустой файл');
  if (file.size > MAX) throw new ValidationError('Фото слишком большое (максимум 4 МБ)');
  const data = new Uint8Array(await file.arrayBuffer());
  const buf = Buffer.from(data);
  const isJpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP';
  const mime = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : null;
  if (!mime) throw new ValidationError('Поддерживаются только JPG, PNG и WebP');
  return { data, mime };
}
