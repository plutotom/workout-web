import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Header for a page. On nested routes, pass `backHref` to show a back chevron.
 * `action` renders on the right (e.g. a Finish / Save button).
 */
export function PageHeader({
  title,
  description,
  backHref,
  action,
  className,
}: {
  title: string;
  description?: string;
  backHref?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back"
          className="text-muted-foreground hover:text-foreground -ml-2 mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <ChevronLeft className="size-5" />
        </Link>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold">{title}</h1>
        {description ? (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
