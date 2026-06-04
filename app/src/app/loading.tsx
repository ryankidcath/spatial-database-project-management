import { Spinner } from "@/components/ui/spinner";

export default function RootLoading() {
  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background text-foreground"
      role="status"
      aria-live="polite"
      aria-label="Memuat workspace"
    >
      <Spinner className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Memuat workspace…</p>
    </div>
  );
}
