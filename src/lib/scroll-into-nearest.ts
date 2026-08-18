/** True when the element is an overflow-y scrollport (not overflow:hidden). */
function isVerticalScrollport(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll";
}

/** Nearest ancestor that can actually scroll vertically. */
export function nearestVerticalScrollport(el: Element): HTMLElement | null {
  let parent = el.parentElement;
  while (parent) {
    if (isVerticalScrollport(parent)) return parent;
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Center (or minimally reveal) `el` inside its nearest overflow-y auto/scroll
 * ancestor. Does not use Element.scrollIntoView, which also shifts
 * overflow:hidden shells (hiding the app nav and leaving a dead gap).
 */
export function scrollIntoNearest(
  el: HTMLElement,
  opts?: { block?: "center" | "nearest"; behavior?: ScrollBehavior },
): void {
  const port = nearestVerticalScrollport(el);
  if (!port) return;

  const elRect = el.getBoundingClientRect();
  const portRect = port.getBoundingClientRect();
  const block = opts?.block ?? "center";
  let delta = 0;
  if (block === "center") {
    delta =
      elRect.top - portRect.top - portRect.height / 2 + elRect.height / 2;
  } else if (elRect.top < portRect.top) {
    delta = elRect.top - portRect.top;
  } else if (elRect.bottom > portRect.bottom) {
    delta = elRect.bottom - portRect.bottom;
  }
  if (Math.abs(delta) >= 1) {
    port.scrollTo({
      top: port.scrollTop + delta,
      behavior: opts?.behavior ?? "smooth",
    });
  }

  // overflow:hidden ancestors can still have a non-zero scrollTop from a
  // prior scrollIntoView; zero them so the nav stays pinned.
  let ancestor: HTMLElement | null = port.parentElement;
  while (ancestor) {
    if (!isVerticalScrollport(ancestor) && ancestor.scrollTop !== 0) {
      ancestor.scrollTop = 0;
    }
    ancestor = ancestor.parentElement;
  }
  if (window.scrollY !== 0) window.scrollTo(0, 0);
}
