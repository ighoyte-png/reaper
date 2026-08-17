/**
 * Index where the progress line switches from solid used hours to dashed
 * planned hours. Past weeks stay solid after the project has ended.
 */
export function progressLineHandoffIndex(
  points: { isCurrentWeek: boolean; isFuture: boolean }[],
): number {
  if (points.length === 0) return -1;
  const currentIdx = points.findIndex((p) => p.isCurrentWeek);
  if (currentIdx >= 0) return currentIdx;
  const futureIdx = points.findIndex((p) => p.isFuture);
  if (futureIdx >= 0) return Math.max(0, futureIdx - 1);
  return points.length - 1;
}
