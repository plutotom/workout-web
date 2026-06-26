"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Dark-only app (V1 locked decision), so the theme is fixed rather than driven
// by next-themes.
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
