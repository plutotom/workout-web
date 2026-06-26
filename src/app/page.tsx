import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function Home() {
  const { user } = await withAuth();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
      <p className="text-2xl font-medium text-zinc-900 dark:text-zinc-50">
        Hello, world.
      </p>
      {user ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Signed in as {user.email}.{" "}
          <Link href="/sign-out" className="underline underline-offset-2">
            Sign out
          </Link>
        </p>
      ) : (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/sign-in" className="underline underline-offset-2">
            Sign in
          </Link>
        </p>
      )}
    </main>
  );
}
