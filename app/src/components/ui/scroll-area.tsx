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
  }
>(
  (
    {
      className,
      children,
      type = "scroll",
      scrollHideDelay = 900,
      fillAvailableHeight = false,
      ...props
    },
    ref
  ) => (
    <ScrollAreaPrimitive.Root
      ref={ref}
      type={type}
      scrollHideDelay={scrollHideDelay}
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className={cn(
          "relative z-0 size-full rounded-[inherit]",
          fillAvailableHeight
            ? "[&>div]:box-border [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:w-full [&>div]:flex-col"
            : "[&>div]:!block"
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation="vertical" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
);
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

export { ScrollArea, ScrollBar };
