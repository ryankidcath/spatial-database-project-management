"use client";

import { useEffect, useState } from "react";

const KEYBOARD_OPEN_THRESHOLD_PX = 8;

export type VisualViewportLayout = {
  /** Jarak atas layout viewport ke atas visual viewport (browser scroll saat keyboard). */
  offsetTop: number;
  /** Tinggi area terlihat (di atas keyboard). */
  height: number;
  /** Keyboard virtual terbuka (perkiraan). */
  keyboardOpen: boolean;
  /** Tinggi keyboard / area tertutup di bawah visual viewport. */
  bottomInset: number;
};

function readVisualViewportLayout(): VisualViewportLayout {
  if (typeof window === "undefined") {
    return { offsetTop: 0, height: 0, keyboardOpen: false, bottomInset: 0 };
  }

  const vv = window.visualViewport;
  if (!vv) {
    return {
      offsetTop: 0,
      height: window.innerHeight,
      keyboardOpen: false,
      bottomInset: 0,
    };
  }

  const bottomInset = Math.max(
    0,
    Math.round(window.innerHeight - vv.height - vv.offsetTop)
  );
  const keyboardOpen = bottomInset > KEYBOARD_OPEN_THRESHOLD_PX;

  return {
    offsetTop: Math.round(vv.offsetTop),
    height: Math.round(vv.height),
    keyboardOpen,
    bottomInset,
  };
}

/** Layout visual viewport — untuk menempel chat mobile saat keyboard virtual terbuka. */
export function useVisualViewportLayout(): VisualViewportLayout {
  const [layout, setLayout] = useState<VisualViewportLayout>(() =>
    readVisualViewportLayout()
  );

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setLayout(readVisualViewportLayout());

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return layout;
}

/** Kunci scroll dokumen saat keyboard chat mobile aktif (hindari header ikut geser). */
export function useLockDocumentScrollWhile(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyWidth = body.style.width;
    const scrollY = window.scrollY;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.width = "100%";
    body.style.top = `-${scrollY}px`;

    const vv = window.visualViewport;
    const onViewportScroll = () => {
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    vv?.addEventListener("scroll", onViewportScroll);

    return () => {
      vv?.removeEventListener("scroll", onViewportScroll);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.width = prevBodyWidth;
      body.style.top = "";
      window.scrollTo(0, scrollY);
    };
  }, [enabled]);
}
