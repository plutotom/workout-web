import { cn } from "@/lib/utils";

export function InsightsSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
