import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  // standalone нужен для Docker; на Vercel сборку делает сама платформа
  output: process.env.VERCEL ? undefined : 'standalone',
  outputFileTracingRoot: path.join(process.cwd(), '../../'),
  transpilePackages: ['@complex/core'],
  serverExternalPackages: ['pg', 'exceljs'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        // Mini App встраивается в Telegram (iframe в Telegram Web / WebView в приложениях)
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" },
      ],
    }];
  },
};
export default config;
