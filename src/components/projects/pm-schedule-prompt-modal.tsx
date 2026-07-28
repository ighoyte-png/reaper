"use client";

import { Modal } from "@/components/ui/form";

export type PmSchedulePromptKind = "overwrite" | "align";

export function PmSchedulePromptModal({
  kind,
  onConfirm,
  onSkip,
}: {
  kind: PmSchedulePromptKind;
  onConfirm: () => void;
  onSkip: () => void;
}) {
  const title =
    kind === "overwrite"
      ? "Overwrite schedule time?"
      : "Align schedule with timeline?";
  const body =
    kind === "overwrite"
      ? "This project manager already has schedule time on this project. Replace it with the new daily hours and timeline?"
      : "The project timeline changed. Update the project manager’s schedule assignment to match the new start and completion dates?";

  return (
    <Modal title={title} onClose={onSkip}>
      <p className="mb-4 text-sm text-[var(--text-muted)]">{body}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="h-9 cursor-pointer rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--row-hover)]"
          onClick={onSkip}
        >
          Keep existing
        </button>
        <button
          type="button"
          className="h-9 cursor-pointer rounded-md bg-[var(--accent)] px-3 text-sm font-medium text-[var(--accent-fg)]"
          onClick={onConfirm}
        >
          {kind === "overwrite" ? "Overwrite" : "Align schedule"}
        </button>
      </div>
    </Modal>
  );
}
