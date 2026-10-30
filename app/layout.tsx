import type { Metadata } from 'next';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/fraunces';
import './globals.css';

export const metadata: Metadata = {
  title: 'Djesshop — Vos idées prennent forme',
  description: 'Donnez vie à vos idées grâce à l’impression 3D sur mesure. Racontez-nous votre projet et choisissez votre couleur.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
