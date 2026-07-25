"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";

const START_DELAY_MS = 100;
const TRICKLE_MS = 320;
const FINISH_MS = 220;
const SAFETY_MS = 12_000;

/** Schedule outside React's insertion/layout phase (Next may call history APIs there). */
function defer(fn: () => void) {
  queueMicrotask(fn);
}

/**
 * Thin top-of-viewport bar during App Router navigations (GitHub-style).
 * Starts on same-origin link clicks / `[data-nav-progress]` controls;
 * completes when pathname or search commits.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  const activeRef = useRef(false);
  const progressRef = useRef(0);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<() => void>(() => {});
  const routeBootRef = useRef(true);

  useEffect(() => {
    function clearStartAndTrickle() {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
      }
      if (trickleRef.current) {
        clearInterval(trickleRef.current);
        trickleRef.current = null;
      }
      if (safetyTimerRef.current) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    }

    function setProgressValue(value: number) {
      progressRef.current = value;
      setProgress(value);
    }

    function finish() {
      if (startTimerRef.current) {
        clearTimeout(startTimerRef.current);
        startTimerRef.current = null;
        return;
      }
      if (!activeRef.current) return;

      clearStartAndTrickle();
      setProgressValue(100);
      setExiting(true);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      finishTimerRef.current = setTimeout(() => {
        activeRef.current = false;
        setActive(false);
        setExiting(false);
        setProgressValue(0);
        finishTimerRef.current = null;
      }, FINISH_MS);
    }

    finishRef.current = () => defer(finish);

    function beginVisible() {
      if (activeRef.current) return;
      activeRef.current = true;
      setExiting(false);
      setActive(true);
      setProgressValue(12);
      trickleRef.current = setInterval(() => {
        const cur = progressRef.current;
        if (cur >= 88) return;
        const step = Math.max(0.6, (90 - cur) * 0.08);
        setProgressValue(Math.min(88, cur + step));
      }, TRICKLE_MS);
      safetyTimerRef.current = setTimeout(() => finish(), SAFETY_MS);
    }

    function start() {
      if (activeRef.current || startTimerRef.current) return;
      startTimerRef.current = setTimeout(() => {
        startTimerRef.current = null;
        beginVisible();
      }, START_DELAY_MS);
    }

    /**
     * Browser / router.back() fires popstate after the URL has already
     * committed — starting a long trickle here leaves the bar stuck until
     * the safety timeout. Complete any in-flight bar instead.
     */
    function onPopState() {
      if (startTimerRef.current || activeRef.current) {
        finish();
      }
    }

    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      const target = e.target as Element | null;
      if (target?.closest?.("[data-nav-progress]")) {
        start();
        return;
      }

      const anchor = target?.closest?.("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
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
      start();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      clearStartAndTrickle();
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (routeBootRef.current) {
      routeBootRef.current = false;
      return;
    }
    finishRef.current();
  }, [routeKey]);

  if (!active && progress === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[10000] h-[2px]"
      aria-hidden
    >
      <div
        className={cn(
          "h-full bg-[var(--accent)]",
          exiting ? "opacity-0" : "opacity-100",
        )}
        style={{
          width: `${progress}%`,
          boxShadow:
            "0 0 8px color-mix(in srgb, var(--accent) 55%, transparent)",
          transition: exiting
            ? "opacity 200ms ease"
            : "width 280ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
    </div>
  );
}
