"use client";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { Modal } from "@/components/ui/form";
import { APP_VERSION } from "@/lib/version";

const TAGLINE = "Project Management That Doesn't Get in Your Way.";

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const year = new Date().getFullYear();

  return (
    <Modal title="About Reaper" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <BrandLockup
          stacked
          className="w-full"
          logoClassName="h-32"
          wordmarkClassName="text-3xl"
        />
        <p className="max-w-sm text-sm text-[var(--text)]">{TAGLINE}</p>
        <dl className="w-full max-w-xs space-y-1.5 text-left text-xs text-[var(--text-muted)]">
          <div className="flex justify-between gap-3">
            <dt>Version</dt>
            <dd className="font-medium text-[var(--text)]">v{APP_VERSION}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Product</dt>
            <dd className="font-medium text-[var(--text)]">Reaper</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Website</dt>
            <dd>
              <a
                href="https://reaperpm.com"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--accent)] hover:underline"
              >
                reaperpm.com
              </a>
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-[var(--text-muted)]">
          © {year} Reaper. All rights reserved.
        </p>
      </div>
    </Modal>
  );
}
