import * as React from "react";

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/80", className)}
      {...props}
    />
  );
}

function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, idx) => {
        const width =
          idx === lines - 1 ? "w-[72%]" : idx === 1 ? "w-[88%]" : "w-full";
        return <Skeleton key={idx} className={cn("h-2.5", width)} />;
      })}
    </div>
  );
}

function SkeletonAvatar({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm" ? "h-8 w-8" : size === "lg" ? "h-14 w-14" : "h-10 w-10";
  return <Skeleton className={cn("rounded-full", sizeClass, className)} />;
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border/70 p-4", className)}>
      <div className="mb-3 flex items-center gap-3">
        <SkeletonAvatar size="sm" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-2 h-2.5 w-24" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

function SkeletonForm({ className }: { className?: string }) {
  return (
    <div className={cn("w-full space-y-3", className)}>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-20 w-full" />
      </div>
      <Skeleton className="h-9 w-32" />
    </div>
  );
}

function SkeletonTable({
  rows = 4,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border/70 p-3", className)}>
      <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, idx) => (
          <Skeleton key={`h-${idx}`} className="h-3 w-3/4" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, c) => (
              <Skeleton key={`c-${r}-${c}`} className="h-2.5 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export {
  Skeleton,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonForm,
  SkeletonTable,
  SkeletonText,
};
