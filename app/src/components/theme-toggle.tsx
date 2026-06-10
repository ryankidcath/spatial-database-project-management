"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemeMode = "light" | "dark";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    if (!mounted) return;
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem("theme", next);
  };

  const isDark = mounted && theme === "dark";
  const label = !mounted ? "Ubah tema" : isDark ? "Mode terang" : "Mode gelap";
  const Icon = !mounted || !isDark ? Moon : Sun;

  if (iconOnly) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9 shrink-0"
        onClick={toggleTheme}
        aria-label={label}
        title={label}
      >
        <Icon className="size-4" aria-hidden />
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={toggleTheme}>
      {!mounted ? (
        <>
          <Moon className="mr-1 h-4 w-4" />
          Dark
        </>
      ) : theme === "dark" ? (
        <>
          <Sun className="mr-1 h-4 w-4" />
          Light
        </>
      ) : (
        <>
          <Moon className="mr-1 h-4 w-4" />
          Dark
        </>
      )}
    </Button>
  );
}
