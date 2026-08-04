"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
} from "@/components/ui/simple-rich-text";
import type { MentionPerson } from "@/lib/mentions";
import {
  markTaskDescriptionSeen,
  readTaskDescriptionSeen,
} from "@/lib/task-description-seen";

/** text-sm leading-relaxed (14px × 1.625). */
export const TASK_DESCRIPTION_LINE_HEIGHT_PX = 22.75;
export const TASK_DESCRIPTION_COLLAPSED_LINES = 6;
export const TASK_DESCRIPTION_COLLAPSED_MAX_PX =
  TASK_DESCRIPTION_LINE_HEIGHT_PX * TASK_DESCRIPTION_COLLAPSED_LINES;

function ExpandToggle({
  expanded,
  onToggle,
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] shadow-sm hover:bg-[var(--row-hover)] hover:text-[var(--text)]",
        className,
      )}
      aria-expanded={expanded}
      aria-label={
        expanded ? "Collapse task description" : "Expand task description"
      }
      onClick={onToggle}
    >
      {expanded ? <Minus size={14} /> : <Plus size={14} />}
    </button>
  );
}

function useContentHeight(
  deps: unknown[],
  measure: () => number | null,
): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const next = measure();
    if (next != null) setHeight(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure reads DOM for deps
  }, deps);
  return height;
}

export function TaskDescriptionView({
  html,
  taskId,
  assigneePersonId,
  viewerPersonId,
  viewerProfileId,
  taskExpanded,
  onExpandedChange,
  onCommentsBlockedChange,
}: {
  html: string;
  taskId: string;
  assigneePersonId: string | null;
  viewerPersonId: string | null;
  viewerProfileId: string | null;
  /** Parent task row expanded — resets first-view init when closed. */
  taskExpanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onCommentsBlockedChange?: (blocked: boolean) => void;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const initRef = useRef(false);

  const fullHeight = useContentHeight([html], () => {
    const el = measureRef.current;
    return el ? el.scrollHeight : null;
  });

  const exceeds =
    fullHeight > TASK_DESCRIPTION_COLLAPSED_MAX_PX + 1;

  const isAssignee =
    Boolean(
      viewerPersonId &&
        assigneePersonId &&
        viewerPersonId === assigneePersonId,
    );
  const assigneeFirstView =
    isAssignee &&
    Boolean(viewerProfileId) &&
    !readTaskDescriptionSeen(viewerProfileId, taskId);

  const setExpandedState = useCallback(
    (next: boolean) => {
      setExpanded(next);
      onExpandedChange?.(next);
      if (
        !next &&
        isAssignee &&
        viewerProfileId &&
        assigneeFirstView
      ) {
        markTaskDescriptionSeen(viewerProfileId, taskId);
      }
    },
    [
      assigneeFirstView,
      isAssignee,
      onExpandedChange,
      taskId,
      viewerProfileId,
    ],
  );

  useEffect(() => {
    if (!taskExpanded) {
      initRef.current = false;
      if (isAssignee && viewerProfileId) {
        markTaskDescriptionSeen(viewerProfileId, taskId);
      }
      return;
    }
    if (initRef.current || fullHeight <= 0) return;
    initRef.current = true;
    if (assigneeFirstView && exceeds) {
      setExpandedState(true);
    } else {
      setExpandedState(false);
    }
  }, [
    taskExpanded,
    fullHeight,
    assigneeFirstView,
    exceeds,
    isAssignee,
    viewerProfileId,
    taskId,
    setExpandedState,
  ]);

  const showCollapsed = exceeds && !expanded;
  const animMaxHeight = showCollapsed
    ? TASK_DESCRIPTION_COLLAPSED_MAX_PX
    : fullHeight;

  const commentsBlocked =
    assigneeFirstView && exceeds && expanded;

  useEffect(() => {
    onCommentsBlockedChange?.(commentsBlocked);
  }, [commentsBlocked, onCommentsBlockedChange]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text-muted)]">
        Task Description
      </p>
      <div className="relative w-full">
        <div
          ref={measureRef}
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 opacity-0"
          aria-hidden
        >
          <RichNotesHtml
            html={html}
            className="text-sm leading-relaxed text-[var(--text)]"
          />
        </div>
        <div
          className={cn(
            "overflow-hidden transition-[max-height] duration-200 ease-out motion-reduce:transition-none",
            showCollapsed && "task-description-collapsed-fade",
          )}
          style={{
            maxHeight: animMaxHeight > 0 ? animMaxHeight : undefined,
          }}
        >
          <RichNotesHtml
            html={html}
            className="text-sm leading-relaxed text-[var(--text)]"
          />
        </div>
        {exceeds ? (
          <ExpandToggle
            expanded={expanded}
            onToggle={() => setExpandedState(!expanded)}
            className="absolute bottom-0 right-0"
          />
        ) : null}
      </div>
    </div>
  );
}

export function TaskDescriptionEditor({
  value,
  onChange,
  mentionPeople,
  initialExpanded = false,
}: {
  value: string;
  onChange: (html: string) => void;
  mentionPeople?: MentionPerson[];
  /** Match view-mode collapse when opening edit. */
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const [contentHeight, setContentHeight] = useState(
    TASK_DESCRIPTION_COLLAPSED_MAX_PX,
  );
  const editorMountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded(initialExpanded);
  }, [initialExpanded]);

  useLayoutEffect(() => {
    const root = editorMountRef.current;
    if (!root) return;
    const prose = root.querySelector(".ProseMirror");
    if (!(prose instanceof HTMLElement)) return;

    const measure = () => {
      setContentHeight(Math.max(prose.scrollHeight, TASK_DESCRIPTION_COLLAPSED_MAX_PX));
    };
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(prose);
    return () => ro.disconnect();
  }, [value]);

  const exceeds =
    contentHeight > TASK_DESCRIPTION_COLLAPSED_MAX_PX + 1;
  const editorMaxHeight = expanded
    ? contentHeight
    : TASK_DESCRIPTION_COLLAPSED_MAX_PX;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text-muted)]">
        Task Description
      </p>
      <div className="relative w-full" ref={editorMountRef}>
        <SimpleRichTextEditor
          value={value}
          onChange={onChange}
          placeholder="Add a task description… Use @ to mention"
          mentionPeople={mentionPeople}
          className="mt-0 w-full"
          editorMaxHeight={editorMaxHeight}
          editorOverflowY="auto"
        />
        {exceeds ? (
          <ExpandToggle
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            className="absolute bottom-2 right-2 z-10"
          />
        ) : null}
      </div>
    </div>
  );
}

export function TaskDescriptionCreateField({
  value,
  onChange,
  mentionPeople,
}: {
  value: string;
  onChange: (html: string) => void;
  mentionPeople?: MentionPerson[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text-muted)]">
        Task Description
      </p>
      <SimpleRichTextEditor
        value={value}
        onChange={onChange}
        placeholder="Add a task description… Use @ to mention"
        mentionPeople={mentionPeople}
        className="mt-0 w-full"
        autoGrow
      />
    </div>
  );
}

export function TaskDescriptionCommentsGate({
  blocked,
  children,
}: {
  blocked: boolean;
  children: ReactNode;
}) {
  if (!blocked) return children;
  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">
        Review the task description above before leaving a comment.
      </p>
      <div className="pointer-events-none opacity-50">{children}</div>
    </div>
  );
}
