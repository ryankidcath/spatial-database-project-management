"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "pm-scroll-area-scrollbar flex touch-none select-none p-px",
      orientation === "vertical" && "h-full w-2 border-l border-l-transparent",
      orientation === "horizontal" && "h-2 w-full flex-col border-t border-t-transparent",
      className
    )}
    {...props}
    forceMount
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative z-10 flex-1 rounded-full bg-foreground/35 transition-colors duration-200 ease-out hover:bg-foreground/50 dark:bg-foreground/40 dark:hover:bg-foreground/55" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    /**
     * When true, the viewport inner wrapper becomes a full-height flex column so
     * children can use `flex-1 min-h-0` to fill space without growing the page.
     */
    fillAvailableHeight?: boolean;
    /** Sembunyikan scrollbar vertikal (mis. tab mobile dengan scroll internal). */
    hideVerticalScrollbar?: boolean;
    /** Scrollbar mana yang ditampilkan. Default hanya vertikal. */
    orientation?: "vertical" | "horizontal" | "both";
    /**
     * Ref ke elemen Viewport (elemen scroll sebenarnya), untuk kebutuhan scroll
     * terprogram seperti `scrollTo` / membaca `scrollTop`.
     */
    viewportRef?: React.Ref<HTMLDivElement>;
    /**
     * Kelas tambahan untuk Viewport (elemen scroll). Berguna untuk memasang
     * batas tinggi (`max-h-…`) di scroller-nya langsung agar pola "tumbuh sampai
     * batas lalu scroll" bekerja (Root cukup `height: auto`).
     */
    viewportClassName?: string;
  }
>(
  (
    {
      className,
      children,
      type = "scroll",
      scrollHideDelay = 900,
      fillAvailableHeight = false,
      hideVerticalScrollbar = false,
      orientation = "vertical",
      viewportRef,
      viewportClassName,
      ...props
    },
    ref
  ) => {
    const showVertical =
      !hideVerticalScrollbar &&
      (orientation === "vertical" || orientation === "both");
    const showHorizontal =
      orientation === "horizontal" || orientation === "both";
    return (
      <ScrollAreaPrimitive.Root
        ref={ref}
        type={type}
        scrollHideDelay={scrollHideDelay}
        className={cn("relative overflow-hidden", className)}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          className={cn(
            "relative z-0 size-full rounded-[inherit]",
            fillAvailableHeight && "overflow-hidden",
            fillAvailableHeight
              ? // `!flex` wajib: Radix memasang `display:table` inline pada wrapper
                // konten. Tanpa `!important`, inline menang → wrapper memakai
                // table-layout auto yang menyusut ke max-content, sehingga konten
                // lebar (mis. tabel) melebarkan area melewati viewport. `!flex`
                // memaksa kolom flex ber-lebar 100% (tidak shrink-to-fit).
                "[&>div]:box-border [&>div]:!flex [&>div]:h-full [&>div]:min-h-0 [&>div]:w-full [&>div]:min-w-0 [&>div]:flex-col [&>div]:overflow-hidden"
              : showHorizontal
                ? undefined
                : "[&>div]:!block",
            viewportClassName
          )}
        >
          {children}
        </ScrollAreaPrimitive.Viewport>
        {showVertical ? <ScrollBar orientation="vertical" /> : null}
        {showHorizontal ? <ScrollBar orientation="horizontal" /> : null}
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    );
  }
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export { ScrollArea, ScrollBar };
