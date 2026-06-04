"use client";

import * as React from "react";
import { Drawer } from "@base-ui/react/drawer";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type SheetSide = "bottom" | "right";

type SheetRootProps = Drawer.Root.Props & {
  side?: SheetSide;
};

function sheetSwipeDirection(side: SheetSide): "down" | "right" {
  return side === "right" ? "right" : "down";
}

function Sheet({ side = "bottom", ...props }: SheetRootProps) {
  return (
    <Drawer.Root
      data-slot="sheet"
      modal
      swipeDirection={sheetSwipeDirection(side)}
      {...props}
    />
  );
}

function SheetPortal({ ...props }: Drawer.Portal.Props) {
  return <Drawer.Portal data-slot="sheet-portal" {...props} />;
}

function SheetBackdrop({ className, ...props }: Drawer.Backdrop.Props) {
  return (
    <Drawer.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-[2100] bg-black/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "bottom",
  showCloseButton = false,
  ...props
}: Drawer.Popup.Props & {
  side?: SheetSide;
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetBackdrop />
      <Drawer.Viewport
        data-slot="sheet-viewport"
        className={cn(
          "fixed z-[2100] outline-none",
          side === "bottom" &&
            "inset-x-0 bottom-0 flex max-h-[min(90dvh,100%)] flex-col",
          side === "right" && "inset-y-0 right-0 flex w-full max-w-md flex-col"
        )}
      >
        <Drawer.Popup
          data-slot="sheet-content"
          role="dialog"
          aria-modal="true"
          className={cn(
            "relative flex min-h-0 flex-col bg-card text-foreground shadow-lg outline-none ring-1 ring-border",
            side === "bottom" &&
              "max-h-[min(90dvh,100%)] w-full rounded-t-xl pb-[env(safe-area-inset-bottom)]",
            side === "right" &&
              "h-full w-full pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]",
            className
          )}
          {...props}
        >
          <Drawer.Content
            data-slot="sheet-body"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            {children}
          </Drawer.Content>
          {showCloseButton ? (
            <Drawer.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-2 right-2 z-10"
                />
              }
            >
              <XIcon className="size-4" />
              <span className="sr-only">Tutup</span>
            </Drawer.Close>
          ) : null}
        </Drawer.Popup>
      </Drawer.Viewport>
    </SheetPortal>
  );
}

export { Sheet, SheetContent, SheetPortal, SheetBackdrop };
