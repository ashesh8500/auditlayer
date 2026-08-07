"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
let navigating = false;

function emit(active: boolean) {
  navigating = active;
  for (const listener of listeners) listener(active);
}

/** Call before programmatic navigations (router.push) so the bar appears. */
export function startNavigationProgress() {
  emit(true);
}

/**
 * Thin top progress bar on in-app navigations.
 * Starts on same-origin link click or startNavigationProgress();
 * completes when the route settles.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const [phase, setPhase] = useState<"idle" | "start" | "done">(
    () => (navigating ? "start" : "idle"),
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onProg = (active: boolean) => {
      if (active) setPhase("start");
    };
    listeners.add(onProg);
    return () => {
      listeners.delete(onProg);
    };
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }
      emit(true);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!navigating) return;
    emit(false);
    if (timer.current) clearTimeout(timer.current);
    const frame = requestAnimationFrame(() => {
      setPhase("done");
      timer.current = setTimeout(() => setPhase("idle"), 180);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [routeKey]);

  if (phase === "idle") return null;

  return (
    <div
      aria-hidden
      className={`alm-nav-progress ${phase === "done" ? "alm-nav-progress--done" : "alm-nav-progress--active"}`}
    />
  );
}
