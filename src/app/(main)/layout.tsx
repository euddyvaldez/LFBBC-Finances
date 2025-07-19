
'use client';
import { BottomNav } from '@/components/BottomNav';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { Header } from '@/components/Header';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex">
        <DesktopSidebar />
        <main className="flex-1">
          <div className="container mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
      <div className="md:hidden h-[70px]" /> {/* Spacer for bottom nav */}
      <BottomNav />
    </div>
  );
}
