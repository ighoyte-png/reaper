"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type StringRecord = Record<string, string>;

/**
 * Sync a small string filter map to the URL via `router.replace`.
 * Defaults are omitted from the query string. Debounced keys (e.g. `q`)
 * update local state immediately and write the URL after a delay.
 */
export function useUrlFilters<T extends StringRecord>(
  defaults: T,
  options?: {
    debounceMs?: Partial<Record<keyof T & string, number>>;
  },
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const debounceRef = useRef(options?.debounceMs);
  debounceRef.current = options?.debounceMs;

  const parse = useCallback((sp: URLSearchParams): T => {
    const next = { ...defaultsRef.current };
    for (const key of Object.keys(defaultsRef.current)) {
      const raw = sp.get(key);
      if (raw != null && raw !== "") {
        (next as StringRecord)[key] = raw;
      }
    }
    return next;
  }, []);

  const urlFilters = useMemo(
    () => parse(searchParams),
    [parse, searchParams],
  );

  const [draft, setDraft] = useState<T | null>(null);
  const filters = draft ?? urlFilters;
  const pendingRef = useRef(filters);
  pendingRef.current = filters;

  const spStr = searchParams.toString();
  useEffect(() => {
    setDraft(null);
  }, [spStr]);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, []);

  const replaceUrl = useCallback(
    (next: T) => {
      const defs = defaultsRef.current;
      const params = new URLSearchParams(searchParams.toString());
      for (const key of Object.keys(defs)) {
        params.delete(key);
      }
      for (const key of Object.keys(defs)) {
        const value = next[key];
        if (value && value !== defs[key]) {
          params.set(key, value);
        }
      }
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      router.replace(href, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setFilter = useCallback(
    <K extends keyof T & string>(key: K, value: T[K]) => {
      const next = { ...pendingRef.current, [key]: value };
      pendingRef.current = next;
      setDraft(next);

      const ms = debounceRef.current?.[key] ?? 0;
      if (writeTimer.current) clearTimeout(writeTimer.current);

      const flush = () => {
        replaceUrl(pendingRef.current);
      };

      if (ms > 0) {
        writeTimer.current = setTimeout(flush, ms);
      } else {
        flush();
      }
    },
    [replaceUrl],
  );

  const setFilters = useCallback(
    (patch: Partial<T>) => {
      const next = { ...pendingRef.current, ...patch };
      pendingRef.current = next;
      setDraft(next);
      if (writeTimer.current) clearTimeout(writeTimer.current);
      replaceUrl(next);
    },
    [replaceUrl],
  );

  return { filters, setFilter, setFilters };
}
