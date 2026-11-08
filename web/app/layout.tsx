import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tablebound — MTG Commander',
  description: 'Deckbuilder a online 1v1 klient pro Magic: The Gathering Commander',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="cs" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
