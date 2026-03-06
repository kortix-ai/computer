'use client';

import { Navbar } from '@/components/home/navbar';
import { SimpleFooter } from '@/components/home/simple-footer';
import { usePathname } from 'next/navigation';

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isHomePage = pathname === '/' || pathname === '/color';

  return (
    <div className="w-full min-h-dvh relative">
      {/* Home & /color: fixed overlay navbar. Other pages: sticky top with blur. */}
      <div className={isHomePage ? 'fixed top-0 left-0 right-0 z-50' : 'sticky top-0 z-50 bg-background/80 backdrop-blur-md'}>
        <Navbar isAbsolute={isHomePage} />
      </div>
      {children}
      {/* Hide footer on home page and /color */}
      {!isHomePage && <SimpleFooter />}
    </div>
  );
}
