"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  RichNotesHtml,
  SimpleRichTextEditor,
  type SimpleRichTextEditorHandle,
} from "@/components/ui/simple-rich-text";
import { EntityFileAttachments } from "@/components/ui/file-attachments";
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

/** Match task-row-exit (280ms) for expand/collapse height. */
const DESC_HEIGHT_TRANSITION =
  "transition-[max-height] duration-[280ms] ease-out motion-reduce:transition-none";

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
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
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
  showAttachments = false,
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
  showAttachments?: boolean;
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

  function expandFromBody(e: MouseEvent | KeyboardEvent) {
    if (!showCollapsed) return;
    e.preventDefault();
    setExpandedState(true);
  }

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
            "overflow-hidden",
            DESC_HEIGHT_TRANSITION,
            showCollapsed && "task-description-collapsed-fade cursor-pointer",
          )}
          style={{
            maxHeight: animMaxHeight > 0 ? animMaxHeight : undefined,
          }}
          role={showCollapsed ? "button" : undefined}
          tabIndex={showCollapsed ? 0 : undefined}
          aria-label={
            showCollapsed ? "Expand task description" : undefined
          }
          onClick={showCollapsed ? expandFromBody : undefined}
          onKeyDown={
            showCollapsed
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    expandFromBody(e);
                  }
                }
              : undefined
          }
        >
          <RichNotesHtml
            html={html}
            className="text-sm leading-relaxed text-[var(--text)]"
          />
        </div>
        {exceeds ? (
          <ExpandToggle
            expanded={expanded}
            onToggle={() => {
              if (expanded) setExpandedState(false);
              else setExpandedState(true);
            }}
            className="absolute bottom-0 right-0"
          />
        ) : null}
      </div>
      {showAttachments ? (
        <EntityFileAttachments
          entityType="task_note"
          entityId={taskId}
          className="border-t border-[var(--border)] pt-2"
        />
      ) : null}
    </div>
  );
}

export const TaskDescriptionEditor = forwardRef<
  SimpleRichTextEditorHandle,
  {
    value: string;
    onChange: (html: string) => void;
    mentionPeople?: MentionPerson[];
    /** Match view-mode collapse when opening edit. */
    initialExpanded?: boolean;
    taskId?: string | null;
    enableAttachments?: boolean;
    isDemo?: boolean;
    onAttachmentError?: (msg: string) => void;
  }
>(function TaskDescriptionEditor(
  {
    value,
    onChange,
    mentionPeople,
    initialExpanded = false,
    taskId,
    enableAttachments = false,
    isDemo = false,
    onAttachmentError,
  },
  ref,
) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded(initialExpanded);
  }, [initialExpanded]);

  // Full unclipped height — not the collapsed editor viewport (which would
  // hide the +/− toggle until the user types).
  const fullHeight = useContentHeight([value], () => {
    const el = measureRef.current;
    return el ? el.scrollHeight : null;
  });

  const exceeds = fullHeight > TASK_DESCRIPTION_COLLAPSED_MAX_PX + 1;
  // Collapsed: fixed max height (scroll inside editor). Expanded: uncapped so
  // content grows naturally without max-height animations fighting caret scroll.
  const editorMaxHeight = expanded
    ? undefined
    : TASK_DESCRIPTION_COLLAPSED_MAX_PX;

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
            html={value}
            className="px-2 py-2 text-sm leading-relaxed text-[var(--text)]"
          />
        </div>
        <SimpleRichTextEditor
          ref={ref}
          value={value}
          onChange={onChange}
          placeholder="Add a task description… Use @ to mention"
          mentionPeople={mentionPeople}
          className="mt-0 w-full"
          editorMaxHeight={editorMaxHeight}
          editorOverflowY={expanded ? undefined : "auto"}
          autoGrow={expanded}
          enableAttachments={enableAttachments}
          attachmentEntityType="task_note"
          attachmentEntityId={taskId ?? null}
          isDemo={isDemo}
          onAttachmentError={onAttachmentError}
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
});

export const TaskDescriptionCreateField = forwardRef<
  SimpleRichTextEditorHandle,
  {
    value: string;
    onChange: (html: string) => void;
    mentionPeople?: MentionPerson[];
    taskId?: string | null;
    enableAttachments?: boolean;
    isDemo?: boolean;
    onAttachmentError?: (msg: string) => void;
  }
>(function TaskDescriptionCreateField(
  {
    value,
    onChange,
    mentionPeople,
    taskId,
    enableAttachments = false,
    isDemo = false,
    onAttachmentError,
  },
  ref,
) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--text-muted)]">
        Task Description
      </p>
      <SimpleRichTextEditor
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder="Add a task description… Use @ to mention"
        mentionPeople={mentionPeople}
        className="mt-0 w-full"
        autoGrow
        enableAttachments={enableAttachments}
        attachmentEntityType="task_note"
        attachmentEntityId={taskId ?? null}
        isDemo={isDemo}
        onAttachmentError={onAttachmentError}
      />
    </div>
  );
});

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
