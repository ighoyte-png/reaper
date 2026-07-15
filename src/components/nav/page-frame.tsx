/** Scrollable page body under the topbar inside the fixed app shell. */
export function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {children}
    </div>
  );
}
