/**
 * ContextMenuDispatcher.tsx — Right-click context menu for 3D entities.
 *
 * Sub-AC 8b: Serialize context-menu selections into command files.
 *
 * Provides:
 *  1. `useContextMenu()` hook — open/close the portal menu at the cursor.
 *  2. `ContextMenuPortal` — the floating menu DOM element (mount once in HUD).
 *  3. Pre-built menu configurations for agent, room, and task entities.
 *
 * Architecture
 * ────────────
 * The context menu state lives in a Zustand slice (contextMenuStore) so that
 * any 3D scene component (R3F canvas) can trigger the menu by calling
 * `openMenu(items, position)` without prop-drilling through the canvas boundary.
 *
 * When a menu item is selected, `handleContextMenuAction(item)` is called on
 * the `ActionDispatcher`, which serializes the interaction to a command file.
 *
 * Design: dark command-center aesthetic with hex-border separators.
 */

import {
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { create } from "zustand";
import {
  useActionDispatcher,
  type ContextMenuItem,
  type AgentActionType,
  type RoomActionType,
  type TaskActionType,
} from "../hooks/use-action-dispatcher.js";
import { useTaskManagementStore } from "../hooks/use-task-management.js";
import type { TaskPriority } from "../data/task-types.js";
import { TASK_PRIORITY_LABEL, TASK_PRIORITY_COLOR } from "../data/task-types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Context menu store
// ─────────────────────────────────────────────────────────────────────────────

interface MenuEntry {
  label: string;
  icon: string;
  item: ContextMenuItem;
  /** Red for destructive actions, yellow for warnings, normal otherwise */
  variant?: "normal" | "destructive" | "warning" | "disabled";
  /** Visual separator above this entry */
  separator?: boolean;
  /**
   * Optional local handler that bypasses ActionDispatcher.
   * Used for "panel-opening" actions (e.g. create-task, reprioritize)
   * that need to open a modal form before emitting a command.
   * When present, this callback is called instead of
   * `dispatcher.handleContextMenuAction(item)`.
   */
  onSelect?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  entries: MenuEntry[];
  focusIndex: number;

  openMenu: (entries: MenuEntry[], x: number, y: number) => void;
  closeMenu: () => void;
  setFocusIndex: (idx: number) => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  visible:    false,
  x:          0,
  y:          0,
  entries:    [],
  focusIndex: 0,

  openMenu: (entries, x, y) => set({ visible: true, x, y, entries, focusIndex: 0 }),
  closeMenu: ()               => set({ visible: false, entries: [], focusIndex: 0 }),
  setFocusIndex: (idx)        => set({ focusIndex: idx }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Public hook: useContextMenu
// ─────────────────────────────────────────────────────────────────────────────

export interface UseContextMenuReturn {
  /** Open the context menu for an agent entity at the given screen coords. */
  openAgentMenu: (agentId: string, x: number, y: number, extra?: {
    currentRoom?: string;
    availableRooms?: Array<{ roomId: string; name: string }>;
  }) => void;

  /** Open the context menu for a room entity. */
  openRoomMenu: (roomId: string, x: number, y: number, extra?: {
    isPaused?: boolean;
    agentsInRoom?: string[];
  }) => void;

  /** Open the context menu for a task entity. */
  openTaskMenu: (taskId: string, x: number, y: number, extra?: {
    agentId?: string;
    isCancellable?: boolean;
    /** Sub-AC 7b: task title for reprioritize/cancel panel headers */
    taskTitle?: string;
    /** Sub-AC 7b: current priority for reprioritize submenu */
    currentPriority?: TaskPriority;
    /** Sub-AC 7b: task status for cancel guard */
    taskStatus?: string;
  }) => void;

  /** Close the context menu. */
  closeMenu: () => void;
}

/**
 * `useContextMenu` — hook for opening entity-specific context menus.
 *
 * Components call `openAgentMenu(agentId, x, y)` on right-click.
 * The menu items are pre-configured for the entity type and route through
 * `ActionDispatcher.handleContextMenuAction` on selection.
 */
export function useContextMenu(): UseContextMenuReturn {
  const { openMenu, closeMenu } = useContextMenuStore();

  const openAgentMenu = useCallback(
    (
      agentId: string,
      x: number,
      y: number,
      extra?: {
        currentRoom?: string;
        availableRooms?: Array<{ roomId: string; name: string }>;
      },
    ) => {
      const taskMgmt = useTaskManagementStore.getState();

      const entries: MenuEntry[] = [
        {
          label: "Drill into agent",
          icon:  "◈",
          item:  { entityType: "agent", entityId: agentId, action: "drill_into" as AgentActionType },
        },
        {
          label: "Select",
          icon:  "◎",
          item:  { entityType: "agent", entityId: agentId, action: "select" as AgentActionType },
        },
        {
          label: "Send command",
          icon:  "▶",
          item:  {
            entityType: "agent",
            entityId: agentId,
            action: "send_command" as AgentActionType,
            meta: { instruction: "Report current status and active tasks." },
          },
          separator: true,
        },
        // ── Sub-AC 7b: Task management from agent context ───────────────────
        // entityType="agent" + action="select" is a no-dispatch placeholder;
        // the onSelect handler bypasses ActionDispatcher entirely.
        {
          label:     "Create task for agent",
          icon:      "⊕",
          item:      { entityType: "agent" as const, entityId: agentId, action: "select" as AgentActionType },
          separator: true,
          onSelect:  () => taskMgmt.openCreateTask("agent", agentId),
        },
        // ── End Sub-AC 7b ───────────────────────────────────────────────────
        {
          label:   "Spawn agent",
          icon:    "⊕",
          item:    {
            entityType: "agent",
            entityId: agentId,
            action: "spawn" as AgentActionType,
            meta: { room_id: extra?.currentRoom ?? "default" },
          },
          separator: true,
        },
        {
          label: "Pause agent",
          icon:  "⏸",
          item:  { entityType: "agent", entityId: agentId, action: "pause" as AgentActionType },
        },
        {
          label: "Resume agent",
          icon:  "▶",
          item:  { entityType: "agent", entityId: agentId, action: "resume" as AgentActionType },
        },
        {
          label: "Restart agent",
          icon:  "↺",
          item:  {
            entityType: "agent",
            entityId: agentId,
            action: "restart" as AgentActionType,
            meta: { clear_context: false },
          },
          variant:   "warning",
          separator: true,
        },
        {
          label:   "Terminate agent",
          icon:    "⊗",
          item:    {
            entityType: "agent",
            entityId: agentId,
            action: "terminate" as AgentActionType,
            meta: { reason: "user_requested" },
          },
          variant: "destructive",
        },
      ];

      // Add room-assign sub-items if available rooms are provided
      if (extra?.availableRooms?.length) {
        entries.push({
          label:    "── Assign to room ──",
          icon:     "",
          item:     { entityType: "agent", entityId: agentId, action: "select" as AgentActionType },
          variant:  "disabled",
          separator: true,
        });
        for (const room of extra.availableRooms.slice(0, 5)) {
          entries.push({
            label: room.name,
            icon:  "⬡",
            item:  {
              entityType: "agent",
              entityId: agentId,
              action: "assign" as AgentActionType,
              meta: { room_id: room.roomId },
            },
          });
        }
      }

      openMenu(entries, x, y);
    },
    [openMenu],
  );

  const openRoomMenu = useCallback(
    (
      roomId: string,
      x: number,
      y: number,
      extra?: { isPaused?: boolean; agentsInRoom?: string[] },
    ) => {
      const taskMgmt = useTaskManagementStore.getState();

      const entries: MenuEntry[] = [
        {
          label: "Drill into room",
          icon:  "◈",
          item:  { entityType: "room", entityId: roomId, action: "drill_into" as RoomActionType },
        },
        {
          label: "Select room",
          icon:  "◎",
          item:  { entityType: "room", entityId: roomId, action: "select" as RoomActionType },
        },
        {
          label: "Focus camera",
          icon:  "⊡",
          item:  { entityType: "room", entityId: roomId, action: "focus" as RoomActionType },
          separator: true,
        },
        // ── Sub-AC 7b: Task management from room context ────────────────────
        // entityType="room" + action="select" is a no-dispatch placeholder;
        // the onSelect handler bypasses ActionDispatcher entirely.
        {
          label:     "Create task in room",
          icon:      "⊕",
          item:      { entityType: "room" as const, entityId: roomId, action: "select" as RoomActionType },
          onSelect:  () => taskMgmt.openCreateTask("room", roomId),
        },
        // ── End Sub-AC 7b ───────────────────────────────────────────────────
        ...(extra?.isPaused
          ? [{
              label:     "Resume room",
              icon:      "▶",
              item:      { entityType: "room" as const, entityId: roomId, action: "resume" as RoomActionType },
              variant:   "normal" as const,
              separator: true as const,
            }]
          : [{
              label:     "Pause room",
              icon:      "⏸",
              item:      { entityType: "room" as const, entityId: roomId, action: "pause" as RoomActionType },
              variant:   "warning" as const,
              separator: true as const,
            }]
        ),
        {
          label:     "Convene meeting",
          icon:      "◆",
          item:      {
            entityType: "room",
            entityId: roomId,
            action: "convene_meeting" as RoomActionType,
            meta: {
              topic:           "Ad-hoc meeting",
              participant_ids: extra?.agentsInRoom ?? [],
              requested_by:    "gui",
            },
          },
          variant:   "normal",
          separator: true,
        },
      ];

      openMenu(entries, x, y);
    },
    [openMenu],
  );

  const openTaskMenu = useCallback(
    (
      taskId: string,
      x: number,
      y: number,
      extra?: {
        agentId?: string;
        isCancellable?: boolean;
        taskTitle?: string;
        currentPriority?: TaskPriority;
        taskStatus?: string;
      },
    ) => {
      const taskMgmt = useTaskManagementStore.getState();
      const taskTitle = extra?.taskTitle ?? taskId;

      const entries: MenuEntry[] = [
        {
          label: "View task",
          icon:  "◎",
          item:  { entityType: "task", entityId: taskId, action: "select" as TaskActionType },
        },
        ...(extra?.agentId
          ? [{
              label:    `Assign to ${extra.agentId}`,
              icon:     "⊕",
              item:     {
                entityType: "task" as const,
                entityId: taskId,
                action: "assign" as TaskActionType,
                meta: { agent_id: extra.agentId },
              },
              separator: true as const,
            }]
          : []
        ),
        // ── Sub-AC 7b: Reprioritize submenu ────────────────────────────────
        ...(extra?.currentPriority
          ? [{
              label:    "── Reprioritize ──",
              icon:     "",
              item:     { entityType: "task" as const, entityId: taskId, action: "select" as TaskActionType },
              variant:  "disabled" as const,
              separator: true as const,
            },
            ...([
              "critical" as TaskPriority,
              "high"     as TaskPriority,
              "normal"   as TaskPriority,
              "low"      as TaskPriority,
            ].map((p) => {
              const isCurrent = p === extra.currentPriority;
              const color = TASK_PRIORITY_COLOR[p];
              const label = TASK_PRIORITY_LABEL[p];
              return {
                label:    isCurrent ? `${label} ← current` : label,
                icon:     p === "critical" ? "🔴" : p === "high" ? "🟠" : p === "normal" ? "🔵" : "⚪",
                item:     {
                  entityType: "task" as const,
                  entityId: taskId,
                  action: "update_spec" as TaskActionType,
                  meta: { priority: p },
                },
                variant:  (isCurrent ? "disabled" : "normal") as "normal" | "disabled",
                // Sub-AC 7b: clicking a non-current priority opens the picker
                // panel with the CURRENT priority highlighted so the user can
                // confirm the change or choose a different target priority.
                onSelect: isCurrent
                  ? undefined
                  : () => taskMgmt.openReprioritizeTask(
                      taskId,
                      taskTitle,
                      extra!.currentPriority!, // pass CURRENT for panel highlight
                    ),
              };
              void color; // referenced for type check
            }))]
          : []
        ),
        // ── End Sub-AC 7b ───────────────────────────────────────────────────
        ...(extra?.isCancellable !== false
          ? [{
              label:   "Cancel task",
              icon:    "⊗",
              item:    {
                entityType: "task" as const,
                entityId: taskId,
                action: "cancel" as TaskActionType,
                meta: { reason: "user_requested" },
              },
              variant:  "destructive" as const,
              separator: !extra?.currentPriority,
              onSelect: () => taskMgmt.openCancelTask(
                taskId,
                taskTitle,
                (extra?.taskStatus ?? "active") as import("../data/task-types.js").TaskStatus,
              ),
            }]
          : []
        ),
      ];

      openMenu(entries, x, y);
    },
    [openMenu],
  );

  return { openAgentMenu, openRoomMenu, openTaskMenu, closeMenu };
}

// ─────────────────────────────────────────────────────────────────────────────
// ContextMenuPortal — the floating menu DOM element
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mount `<ContextMenuPortal>` once at the root level (inside HUD or App).
 * It renders a portal menu at (x, y) when `useContextMenuStore.visible` is true.
 *
 * Keyboard navigation: ArrowUp/Down to move focus, Enter to select, Escape to close.
 */
export function ContextMenuPortal() {
  const { visible, x, y, entries, focusIndex, closeMenu, setFocusIndex } =
    useContextMenuStore();
  const dispatcher = useActionDispatcher();
  const menuRef    = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    }
    document.addEventListener("mousedown", handleOutside, true);
    return () => document.removeEventListener("mousedown", handleOutside, true);
  }, [visible, closeMenu]);

  // Auto-focus the menu div for keyboard navigation
  useEffect(() => {
    if (visible) {
      setTimeout(() => menuRef.current?.focus(), 10);
    }
  }, [visible]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!visible) return;
      if (e.key === "Escape") {
        closeMenu();
        return;
      }
      const active = entries.filter((en) => en.variant !== "disabled");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((focusIndex + 1) % entries.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((focusIndex - 1 + entries.length) % entries.length);
      } else if (e.key === "Enter") {
        const entry = entries[focusIndex];
        if (entry && entry.variant !== "disabled") {
          if (entry.onSelect) {
            entry.onSelect();
          } else {
            void dispatcher.handleContextMenuAction(entry.item);
          }
          closeMenu();
        }
        void active;
      }
    },
    [visible, entries, focusIndex, closeMenu, setFocusIndex, dispatcher],
  );

  if (!visible) return null;

  // Clamp menu to viewport
  const menuWidth  = 220;
  const menuHeight = entries.length * 36 + 16;
  const clampedX   = Math.min(x, window.innerWidth  - menuWidth  - 8);
  const clampedY   = Math.min(y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position:        "fixed",
        left:            clampedX,
        top:             clampedY,
        zIndex:          9999,
        background:      "rgba(10, 12, 18, 0.97)",
        border:          "1px solid rgba(100, 180, 255, 0.35)",
        borderRadius:    4,
        padding:         "6px 0",
        minWidth:        menuWidth,
        boxShadow:       "0 4px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(100,180,255,0.1)",
        fontFamily:      "'JetBrains Mono', 'Fira Code', monospace",
        fontSize:        12,
        outline:         "none",
        backdropFilter:  "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {entries.map((entry, idx) => {
        const isFocused    = idx === focusIndex;
        const isDisabled   = entry.variant === "disabled";
        const isDestructive = entry.variant === "destructive";
        const isWarning    = entry.variant === "warning";

        return (
          <div key={idx}>
            {entry.separator && idx > 0 && (
              <div
                style={{
                  height:     1,
                  margin:     "4px 8px",
                  background: "rgba(100, 180, 255, 0.15)",
                }}
              />
            )}
            <div
              role={isDisabled ? "separator" : "menuitem"}
              aria-disabled={isDisabled}
              tabIndex={isDisabled ? -1 : 0}
              onClick={
                isDisabled
                  ? undefined
                  : () => {
                      if (entry.onSelect) {
                        entry.onSelect();
                      } else {
                        void dispatcher.handleContextMenuAction(entry.item);
                      }
                      closeMenu();
                    }
              }
              onMouseEnter={() => !isDisabled && setFocusIndex(idx)}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          8,
                padding:      "6px 14px",
                cursor:       isDisabled ? "default" : "pointer",
                color:        isDisabled
                  ? "rgba(100,120,150,0.5)"
                  : isDestructive
                    ? "#ff5555"
                    : isWarning
                      ? "#ffcc44"
                      : "#ccd4e0",
                background:   isFocused && !isDisabled
                  ? "rgba(100, 180, 255, 0.12)"
                  : "transparent",
                transition:   "background 80ms ease",
                userSelect:   "none",
              }}
            >
              {entry.icon && (
                <span
                  style={{
                    fontSize:   13,
                    width:      16,
                    flexShrink: 0,
                    opacity:    isDisabled ? 0.4 : 0.85,
                  }}
                >
                  {entry.icon}
                </span>
              )}
              <span style={{ flex: 1 }}>{entry.label}</span>
              {isFocused && !isDisabled && (
                <span style={{ opacity: 0.5, fontSize: 10 }}>⏎</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: buildAgentMenuEntries / buildRoomMenuEntries / buildTaskMenuEntries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build standard context menu entries for an agent.
 * Exported so R3F scene components can call `openMenu(buildAgentMenuEntries(agentId), x, y)`
 * when a Three.js mesh is right-clicked.
 *
 * Status-aware entries (Sub-AC 7a):
 *   - inactive / terminated → "Start" entry is shown (emits agent.spawn command)
 *   - active / busy         → "Pause" entry is shown (emits agent.pause command)
 *   - idle / active / busy  → "Resume" entry is shown (emits agent.resume command)
 *   - all statuses          → "Restart" and "Terminate" always visible
 *   - all statuses          → "Reassign" sub-list when availableRooms provided
 *
 * Sub-AC 7b additions:
 *   - all statuses          → "Create task for agent" entry opens TaskManagementPanel
 */
export function buildAgentMenuEntries(
  agentId: string,
  opts?: {
    currentRoom?:    string;
    availableRooms?: Array<{ roomId: string; name: string }>;
    /** Agent operational status — used to show context-sensitive lifecycle entries. */
    agentStatus?:    string;
  },
): MenuEntry[] {
  const status = opts?.agentStatus ?? "";

  const isInactiveOrTerminated =
    status === "inactive" || status === "terminated";
  const isRunning =
    status === "active" || status === "busy";
  const canResume =
    status === "idle" || status === "active" || status === "busy";

  const taskMgmt = useTaskManagementStore.getState();

  const entries: MenuEntry[] = [
    {
      label: "Drill into",
      icon:  "◈",
      item:  { entityType: "agent", entityId: agentId, action: "drill_into" },
    },
    {
      label:     "Send command",
      icon:      "▶",
      item:      {
        entityType: "agent",
        entityId: agentId,
        action: "send_command",
        meta: { instruction: "Report status." },
      },
      separator: true,
    },
    // ── Sub-AC 7b: task management from agent context ──────────────────────
    // entityType="agent" + action="select" is a no-dispatch placeholder;
    // the onSelect handler bypasses ActionDispatcher entirely.
    {
      label:     "Create task for agent",
      icon:      "⊕",
      item:      { entityType: "agent" as const, entityId: agentId, action: "select" as AgentActionType },
      separator: false,
      onSelect:  () => taskMgmt.openCreateTask("agent", agentId),
    },
    // ── End Sub-AC 7b ──────────────────────────────────────────────────────
  ];

  // ── Lifecycle entries — status-aware ────────────────────────────────────────
  //
  // START: only for inactive or terminated agents
  if (isInactiveOrTerminated) {
    entries.push({
      label:     "Start agent",
      icon:      "▶",
      item:      {
        entityType: "agent",
        entityId:   agentId,
        action:     "spawn",
        meta:       { room_id: opts?.currentRoom ?? "default" },
      },
      separator: true,
    });
  }

  // PAUSE: for running agents or when status is unknown (default affordance).
  // When no agentStatus is provided the caller cannot know whether the agent
  // is pausable, so the entry is shown as a safety affordance — consistent with
  // how RESTART and TERMINATE are always shown for non-inactive/terminated agents.
  if (isRunning || (!isInactiveOrTerminated && status !== "idle")) {
    entries.push({
      label:     "Pause",
      icon:      "⏸",
      item:      { entityType: "agent", entityId: agentId, action: "pause" },
      variant:   "warning",
      separator: !isInactiveOrTerminated, // separator when coming after nav entries
    });
  }

  // RESUME: for idle / paused agents (all non-inactive/terminated statuses)
  if (canResume && !isRunning) {
    entries.push({
      label:     "Resume",
      icon:      "▶",
      item:      { entityType: "agent", entityId: agentId, action: "resume" },
      separator: !isInactiveOrTerminated,
    });
  }

  // RESTART + TERMINATE: always shown for live (non-inactive) agents
  if (!isInactiveOrTerminated) {
    entries.push({
      label:     "Restart",
      icon:      "↺",
      item:      {
        entityType: "agent",
        entityId:   agentId,
        action:     "restart",
        meta:       { clear_context: false },
      },
      variant:   "warning",
      separator: !isRunning && !canResume, // separator only if above section absent
    });
    entries.push({
      label:   "Terminate",
      icon:    "⊗",
      item:    {
        entityType: "agent",
        entityId:   agentId,
        action:     "terminate",
        meta:       { reason: "user_requested" },
      },
      variant: "destructive",
    });
  }

  // ── Room reassign sub-list ────────────────────────────────────────────────
  if (opts?.availableRooms?.length) {
    entries.push({
      label:    "── Reassign to room ──",
      icon:     "",
      item:     { entityType: "agent", entityId: agentId, action: "select" },
      variant:  "disabled",
      separator: true,
    });
    for (const room of opts.availableRooms.slice(0, 6)) {
      entries.push({
        label: room.name,
        icon:  "⬡",
        item:  {
          entityType: "agent",
          entityId:   agentId,
          action:     "assign",
          meta:       { room_id: room.roomId },
        },
      });
    }
  }

  return entries;
}

/** Open a context menu from a raw screen event. */
export function openMenuFromEvent(
  event: MouseEvent | PointerEvent,
  entries: MenuEntry[],
): void {
  useContextMenuStore
    .getState()
    .openMenu(entries, event.clientX, event.clientY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-AC 7b: buildTaskMenuEntries — exported helper for task context menus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build standard context menu entries for a task entity.
 *
 * Exported so R3F scene components (e.g. TaskConnectors, task-orb meshes) can
 * call `openMenu(buildTaskMenuEntries(taskId, opts), x, y)` on right-click.
 *
 * Sub-AC 7b: includes reprioritize and cancel actions that open
 * the TaskManagementPanel (modal form/confirmation) rather than firing
 * commands immediately, giving users a chance to review and confirm.
 *
 * @param taskId          The task being operated on.
 * @param opts.taskTitle  Human-readable title (shown in panel headers).
 * @param opts.currentPriority  Current priority level (pre-highlights selector).
 * @param opts.taskStatus       Current status (gates non-cancellable tasks).
 * @param opts.isCancellable    Set to false to suppress Cancel entry.
 * @param opts.agentId          If provided, adds an "Assign to <agent>" entry.
 */
export function buildTaskMenuEntries(
  taskId: string,
  opts?: {
    taskTitle?:       string;
    currentPriority?: TaskPriority;
    taskStatus?:      string;
    isCancellable?:   boolean;
    agentId?:         string;
  },
): MenuEntry[] {
  const taskMgmt  = useTaskManagementStore.getState();
  const taskTitle = opts?.taskTitle ?? taskId;
  const isCancellable = opts?.isCancellable !== false;

  const entries: MenuEntry[] = [
    {
      label: "View task",
      icon:  "◎",
      item:  { entityType: "task", entityId: taskId, action: "select" as TaskActionType },
    },
  ];

  // Assign entry (when called from an agent mesh context)
  if (opts?.agentId) {
    entries.push({
      label:     `Assign to ${opts.agentId}`,
      icon:      "⊕",
      item:      {
        entityType: "task",
        entityId:   taskId,
        action:     "assign" as TaskActionType,
        meta:       { agent_id: opts.agentId },
      },
      separator: true,
    });
  }

  // Reprioritize submenu (Sub-AC 7b)
  if (opts?.currentPriority) {
    entries.push({
      label:     "── Reprioritize ──",
      icon:      "",
      item:      { entityType: "task", entityId: taskId, action: "select" as TaskActionType },
      variant:   "disabled",
      separator: true,
    });

    const PRIORITIES: TaskPriority[] = ["critical", "high", "normal", "low"];
    for (const p of PRIORITIES) {
      const isCurrent = p === opts.currentPriority;
      entries.push({
        label:   isCurrent
          ? `${TASK_PRIORITY_LABEL[p]} ← current`
          : TASK_PRIORITY_LABEL[p],
        icon:    p === "critical" ? "🔴" : p === "high" ? "🟠" : p === "normal" ? "🔵" : "⚪",
        item:    {
          entityType: "task",
          entityId:   taskId,
          action:     "update_spec" as TaskActionType,
          meta:       { priority: p },
        },
        variant:  isCurrent ? "disabled" as const : "normal" as const,
        // Open the picker panel with the CURRENT priority highlighted so the
        // user can confirm or change their mind from the full selector.
        onSelect: isCurrent
          ? undefined
          : () => taskMgmt.openReprioritizeTask(taskId, taskTitle, opts!.currentPriority!),
      });
    }
  }

  // Cancel entry (Sub-AC 7b — opens confirmation panel)
  if (isCancellable) {
    entries.push({
      label:    "Cancel task",
      icon:     "⊗",
      item:     {
        entityType: "task",
        entityId:   taskId,
        action:     "cancel" as TaskActionType,
        meta:       { reason: "user_requested" },
      },
      variant:   "destructive",
      separator: !opts?.currentPriority,
      onSelect:  () => taskMgmt.openCancelTask(
        taskId,
        taskTitle,
        (opts?.taskStatus ?? "active") as import("../data/task-types.js").TaskStatus,
      ),
    });
  }

  return entries;
}
