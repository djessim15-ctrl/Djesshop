import type { Metadata } from 'next';
import Admin from '@/components/Admin';

export const metadata: Metadata = {
  title: 'Administration — Djesshop',
  manifest: '/admin-manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Djesshop' },
  icons: { apple: '/icon-192.png', icon: '/icon.svg' },
};

export default function AdminPage() {
  return <Admin />;
}
