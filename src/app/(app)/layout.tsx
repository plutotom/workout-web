import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { BottomNav } from "@/components/app/bottom-nav";
import { ExerciseCatalogProvider } from "@/components/app/exercise-catalog-provider";
import { UserBootstrap } from "@/components/app/user-bootstrap";
import { WarmQueries } from "@/components/app/warm-queries";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Routes in this group are auth-protected by the proxy; `user` is present.
  const { user } = await withAuth();

  return (
    <ExerciseCatalogProvider>
      <div className="flex min-h-full flex-col">
        <header className="bg-background/95 sticky top-0 z-30 border-b backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mx-auto flex h-14 w-full max-w-[600px] items-center justify-center px-4">
            <Link href="/dashboard" className="font-semibold tracking-tight">
              Workout
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[600px] flex-1 px-4 pt-5 pb-24">
          {children}
        </main>

        <BottomNav />
        <UserBootstrap email={user?.email} />
        <WarmQueries />
      </div>
    </ExerciseCatalogProvider>
  );
}
