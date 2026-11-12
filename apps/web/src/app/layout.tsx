import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { Providers, Shell } from '@/components/App';

export const metadata: Metadata = { title: 'COMPLEX PC: розыгрыш PS5 + GTA 6', robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, viewportFit: 'cover', themeColor: '#050705' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,500;0,600;0,700;0,800;1,800;1,900&display=swap" />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body><Providers><Shell>{children}</Shell></Providers></body>
    </html>
  );
}
