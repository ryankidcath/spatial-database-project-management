import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type WorkspaceMobileListSkeletonVariant = "inbox" | "activity" | "table-row";

export function WorkspaceMobileListRowSkeleton({
  variant = "inbox",
  className,
}: {
  variant?: WorkspaceMobileListSkeletonVariant;
  className?: string;
}) {
  if (variant === "activity") {
    return (
      <li className={cn("min-w-0", className)}>
        <div className="flex w-full min-w-0 flex-col gap-2 rounded-lg px-3 py-2.5">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <Skeleton className="h-3.5 w-[58%]" />
            <Skeleton className="h-2.5 w-14 shrink-0" />
          </div>
          <Skeleton className="h-2.5 w-[72%]" />
          <Skeleton className="h-2.5 w-[48%]" />
        </div>
      </li>
    );
  }

  if (variant === "table-row") {
    return (
      <li className={cn("flex min-w-0 items-stretch gap-0.5", className)}>
        <div className="flex min-h-[3.25rem] min-w-0 flex-1 items-start gap-3 rounded-lg px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-[62%]" />
            <Skeleton className="h-2.5 w-[85%]" />
          </div>
          <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
        </div>
        <Skeleton className="size-10 shrink-0 rounded-lg" />
      </li>
    );
  }

  return (
    <li className={cn("min-w-0", className)}>
      <div className="flex w-full min-h-[3.25rem] items-start gap-3 rounded-lg px-3 py-2.5">
        <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-3.5 w-[55%]" />
            <Skeleton className="h-2.5 w-[28%]" />
          </div>
          <Skeleton className="h-2.5 w-[80%]" />
        </div>
      </div>
    </li>
  );
}

export function WorkspaceMobileListSkeleton({
  count = 5,
  variant = "inbox",
}: {
  count?: number;
  variant?: WorkspaceMobileListSkeletonVariant;
  className?: string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <WorkspaceMobileListRowSkeleton key={index} variant={variant} />
      ))}
    </>
  );
}
