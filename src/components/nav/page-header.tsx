"use client";

export function PageHeader({
  title,
  actions,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-4">
      <div className="min-w-0 flex-1">
        {typeof title === "string" ? (
          <h1 className="truncate text-sm font-semibold tracking-tight">
            {title}
          </h1>
        ) : (
          title
        )}
      </div>
      {actions ? (
        <div className="flex max-w-[60vw] shrink-0 items-center gap-2 overflow-x-auto sm:max-w-none">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
