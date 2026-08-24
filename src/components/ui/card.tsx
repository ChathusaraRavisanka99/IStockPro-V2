import { clsx } from "clsx";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/90 bg-white/92 p-5 text-slate-950 shadow-sm backdrop-blur-sm",
        className,
      )}
      {...props}
    />
  );
}
