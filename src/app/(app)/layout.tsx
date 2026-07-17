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
        <main className="mx-auto w-full min-w-0 max-w-[600px] flex-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[calc(4.25rem+env(safe-area-inset-bottom))]">
          {children}
        </main>

        <BottomNav />
        <UserBootstrap email={user?.email} />
        <WarmQueries />
      </div>
    </ExerciseCatalogProvider>
  );
}
