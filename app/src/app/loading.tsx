import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export default function RootLoading() {
  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-foreground"
      role="status"
      aria-live="polite"
      aria-label="Memuat workspace"
    >
      <Spinner className="size-8 text-muted-foreground" />
      <div className="w-full max-w-xs space-y-2">
        <Skeleton className="mx-auto h-3 w-40" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-[88%]" />
      </div>
      <p className="text-sm text-muted-foreground">Memuat workspace…</p>
    </div>
  );
}
