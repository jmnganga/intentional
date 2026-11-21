import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata, Viewport } from 'next'
import { ServiceWorkerRegister } from '@/components/intentional/sw-register'
import './globals.css'

export const metadata: Metadata = {
  title: 'Intentional',
  description:
    'A private, offline planning app: monthly, weekly and daily commitments that lock once planning closes.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-512.png', apple: '/icon-512.png' },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#101114',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
