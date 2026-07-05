"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  embedded?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
};

/** Dialog penuh atau isi inline (wizard impor Spasial). */
export function ImportDialogShell({
  embedded = false,
  open,
  onOpenChange,
  title,
  description,
  children,
  contentClassName,
}: Props) {
  if (embedded) {
    if (!open) return null;
    return (
      <div className={cn("space-y-3 text-sm", contentClassName)}>{children}</div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] max-w-2xl overflow-y-auto",
          contentClassName
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-3 text-sm">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
