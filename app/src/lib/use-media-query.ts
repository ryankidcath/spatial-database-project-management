"use client";

import { useEffect, useState } from "react";
import { MEDIA_BELOW_MD } from "./breakpoints";

function getMatches(query: string): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => getMatches(query));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Viewport &lt; 768px — layout mobile workspace (sheet, sidebar drawer). */
export function useIsBelowMd(): boolean {
  return useMediaQuery(MEDIA_BELOW_MD);
}
