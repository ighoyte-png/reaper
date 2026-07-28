export function ThemeScript({ nonce }: { nonce?: string }) {
  const code = `
(function(){
  try {
    var stored = localStorage.getItem('reaper-theme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();`;
  // Browsers strip `nonce` from the DOM after execution, which would otherwise
  // look like a server/client mismatch during hydration.
  return (
    <script
      nonce={nonce}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
