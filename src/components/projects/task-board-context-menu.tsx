"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  ChevronRight,
  FolderInput,
  Trash2,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { DateInput, inputClass } from "@/components/ui/form";
import { taskStatusLabel } from "@/lib/domain/tasks";
import type { TaskStatus } from "@/lib/types";

export type TaskBoardContextMenuState = {
  x: number;
  y: number;
  taskIds: string[];
};

type SubMenu = "status" | "assign" | "due" | "move" | null;

type PersonOption = { id: string; name: string };
type ListOption = { id: string; name: string };

export function TaskBoardContextMenu({
  menu,
  onClose,
  canManage,
  manageLists,
  people,
  lists,
  onStatus,
  onAssign,
  onDueDate,
  onMoveToList,
  onDelete,
}: {
  menu: TaskBoardContextMenuState;
  onClose: () => void;
  canManage: boolean;
  manageLists: boolean;
  people: PersonOption[];
  lists: ListOption[];
  onStatus: (status: TaskStatus) => void;
  onAssign: (assigneeId: string | null) => void;
  onDueDate: (dueDate: string | null) => void;
  onMoveToList: (listId: string) => void;
  onDelete: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [sub, setSub] = useState<SubMenu>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  const [dueDraft, setDueDraft] = useState("");
  const count = menu.taskIds.length;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = menu.x;
    let top = menu.y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    setPos({ left, top });
  }, [menu.x, menu.y, sub]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const itemClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--row-hover)]";
  const dangerClass = cn(
    itemClass,
    "text-[var(--status-over)] hover:bg-[var(--status-over)]/10",
  );

  const submenuPanel = (sideClass: string, children: ReactNode) => (
    <div
      className={cn(
        "absolute top-0 z-10 min-w-[10.5rem] max-w-[14rem] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-lg",
        sideClass,
      )}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );

  return createPortal(
    <div
      ref={rootRef}
      role="menu"
      aria-label={
        count > 1 ? `Task actions (${count} selected)` : "Task actions"
      }
      className="fixed z-[80] min-w-[11.5rem] rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-lg"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {count > 1 ? (
        <div className="px-2.5 py-1 text-[10px] font-medium text-[var(--text-muted)]">
          {count} tasks
        </div>
      ) : null}

      <div className="relative">
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onClick={() => setSub((s) => (s === "status" ? null : "status"))}
        >
          <span className="flex-1">Status</span>
          <ChevronRight size={14} className="text-[var(--text-muted)]" />
        </button>
        {sub === "status"
          ? submenuPanel("left-full top-0 ml-1", (
              <>
                {(["upcoming", "active", "complete"] as TaskStatus[]).map(
                  (status) => (
                  <button
                    key={status}
                    type="button"
                    role="menuitem"
                    className={itemClass}
                    onClick={() => {
                      onStatus(status);
                      onClose();
                    }}
                  >
                    {taskStatusLabel(status)}
                  </button>
                ))}
              </>
            ))
          : null}
      </div>

      {canManage ? (
        <>
          <div className="relative">
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => setSub((s) => (s === "assign" ? null : "assign"))}
            >
              <UserRound size={14} className="text-[var(--text-muted)]" />
              <span className="flex-1">Assign</span>
              <ChevronRight size={14} className="text-[var(--text-muted)]" />
            </button>
            {sub === "assign"
              ? submenuPanel(
                  "left-full top-0 ml-1 max-h-64 overflow-y-auto",
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className={itemClass}
                      onClick={() => {
                        onAssign(null);
                        onClose();
                      }}
                    >
                      Unassigned
                    </button>
                    {people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="menuitem"
                        className={itemClass}
                        onClick={() => {
                          onAssign(p.id);
                          onClose();
                        }}
                      >
                        {p.name}
                      </button>
                    ))}
                  </>,
                )
              : null}
          </div>

          <div className="relative">
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => setSub((s) => (s === "due" ? null : "due"))}
            >
              <CalendarDays size={14} className="text-[var(--text-muted)]" />
              <span className="flex-1">Due date</span>
              <ChevronRight size={14} className="text-[var(--text-muted)]" />
            </button>
            {sub === "due"
              ? submenuPanel("left-full top-0 ml-1 p-2", (
                  <div className="flex flex-col gap-2">
                    <DateInput
                      className={cn(inputClass, "mt-0 h-8 py-0 text-xs")}
                      value={dueDraft}
                      onChange={(e) => setDueDraft(e.target.value)}
                      aria-label="Due date"
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="h-7 flex-1 cursor-pointer rounded-md bg-[var(--accent)] px-2 text-xs font-medium text-[var(--accent-fg)]"
                        onClick={() => {
                          if (!dueDraft) return;
                          onDueDate(dueDraft);
                          onClose();
                        }}
                      >
                        Set
                      </button>
                      <button
                        type="button"
                        className="h-7 cursor-pointer rounded-md border border-[var(--border)] px-2 text-xs text-[var(--text)] hover:bg-[var(--row-hover)]"
                        onClick={() => {
                          onDueDate(null);
                          onClose();
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ))
              : null}
          </div>
        </>
      ) : null}

      {manageLists && lists.length > 0 ? (
        <div className="relative">
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => setSub((s) => (s === "move" ? null : "move"))}
          >
            <FolderInput size={14} className="text-[var(--text-muted)]" />
            <span className="flex-1">Move to list</span>
            <ChevronRight size={14} className="text-[var(--text-muted)]" />
          </button>
          {sub === "move"
            ? submenuPanel(
                "left-full top-0 ml-1 max-h-64 overflow-y-auto",
                <>
                  {lists.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      role="menuitem"
                      className={itemClass}
                      onClick={() => {
                        onMoveToList(l.id);
                        onClose();
                      }}
                    >
                      {l.name}
                    </button>
                  ))}
                </>,
              )
            : null}
        </div>
      ) : null}

      {manageLists ? (
        <>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            type="button"
            role="menuitem"
            className={dangerClass}
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
