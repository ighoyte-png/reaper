/** Blocking same-origin boot so theme applies before first paint. */
export function ThemeScript() {
  return <script src="/theme-boot.js" />;
}
