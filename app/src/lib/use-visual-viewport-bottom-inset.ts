"use client";

import { useVisualViewportLayout } from "./use-visual-viewport-layout";

/**
 * Jarak dari tepi bawah layout viewport ke tepi bawah visual viewport.
 * Naik saat keyboard virtual mobile menutupi layar.
 */
export function useVisualViewportBottomInset(): number {
  const { bottomInset } = useVisualViewportLayout();
  return bottomInset;
}
