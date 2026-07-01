"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dumbbell, Home, Settings, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/templates", label: "Templates", icon: Dumbbell },
  { href: "/insights", label: "Insights", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto grid max-w-[600px] grid-cols-4 pb-[env(safe-area-inset-bottom)]">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors active:scale-95",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-8 rounded-full bg-foreground transition-all duration-300",
                  active ? "opacity-100" : "scale-x-0 opacity-0",
                )}
              />
              <Icon
                className={cn(
                  "size-5 transition-transform duration-200",
                  active && "-translate-y-0.5 scale-110",
                )}
                strokeWidth={active ? 2.4 : 2}
              />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
