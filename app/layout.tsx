import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import 'katex/dist/katex.min.css';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const publicBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'Optimization Visual Lab',
  description:
    '互動比較五種 optimizer 在 conditioning、curved valleys、multiple basins、saddle points 與 local minima 下的收斂行為。',
  icons: {
    icon: [{ url: `${publicBasePath}/rozias-logo.png`, type: 'image/png' }],
    shortcut: `${publicBasePath}/rozias-logo.png`,
    apple: `${publicBasePath}/rozias-logo.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
