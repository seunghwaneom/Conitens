import React, { useRef, useCallback } from "react";
import { OfficeAvatar } from "./OfficeAvatar.js";
import type { OfficeRoomPresence } from "../office-presence-model.js";
import roomStyles from "../office-room.module.css";
import entityStyles from "../office-entities.module.css";
import ambientStyles from "../office-ambient.module.css";

function getLedColor(status: string): string {
  switch (status) {
    case "running": return "#4fb062";
    case "idle": return "#c98b12";
    case "error": return "#c14949";
    default: return "#84929f";
  }
}

function getRoomBadgeLabel(room: OfficeRoomPresence) {
  if (room.snapshot.runningCount > 0) return "live";
  if (room.snapshot.agentCount > 0) return "occupied";
  return "quiet";
}

export function OfficeRoomScene({
  room,
  selectedRoomId,
  selectedResidentId,
  onSelectRoom,
  onSelectResident,
}: {
  room: OfficeRoomPresence;
  selectedRoomId: string | null;
  selectedResidentId: string | null;
  onSelectRoom: (roomId: string) => void;
  onSelectResident: (agentId: string) => void;
}) {
  const stationMap = new Map(room.schema.stationAnchors.map((station) => [station.id, station]));
  const latestFamily = room.snapshot.latestFamily ?? "stable";
  const dragState = useRef<{ startX: number; startY: number; moved: boolean } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, moved: false };
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const ds = dragState.current;
    if (!ds) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    if (!ds.moved && Math.abs(dx) + Math.abs(dy) > 3) ds.moved = true;
    if (!ds.moved) return;
    const parent = e.currentTarget.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const el = e.currentTarget;
    const baseLeft = parseFloat(el.dataset.baseLeft ?? "0");
    const baseTop = parseFloat(el.dataset.baseTop ?? "0");
    el.style.left = `${baseLeft + (dx / rect.width) * 100}%`;
    el.style.top = `${baseTop + (dy / rect.height) * 100}%`;
    el.style.zIndex = "10";
    el.style.cursor = "grabbing";
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLSpanElement>, agentId: string) => {
    const ds = dragState.current;
    dragState.current = null;
    e.currentTarget.style.zIndex = "";
    e.currentTarget.style.cursor = "";
    if (!ds?.moved) {
      e.stopPropagation();
      onSelectResident(agentId);
    }
  }, [onSelectResident]);

  const glowMap: Record<string, string> = {
    control: "rgba(80, 141, 212, 0.15)",
    workspace: "rgba(201, 168, 60, 0.12)",
    lab: "rgba(171, 71, 188, 0.12)",
    validation: "rgba(239, 83, 80, 0.12)",
    review: "rgba(66, 165, 245, 0.12)",
    lobby: "rgba(79, 176, 98, 0.10)",
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        roomStyles["office-room-tile"],
        roomStyles[`area-${room.roomId}`],
        roomStyles[`kind-${room.kind}`],
        roomStyles[`tone-${room.schema.floorTone ?? room.kind}`],
        roomStyles[`priority-${room.schema.priority}`],
        roomStyles[`status-${room.snapshot.tone}`],
        room.roomId === selectedRoomId ? roomStyles.selected : "",
      ].filter(Boolean).join(" ")}
      onClick={() => onSelectRoom(room.roomId)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelectRoom(room.roomId);
        }
      }}
    >
      <div className={roomStyles["office-room-meta"]}>
        <div>
          <strong>{room.label}</strong>
        </div>
        <span className={`badge ${room.snapshot.tone}`}>{getRoomBadgeLabel(room)}</span>
      </div>
      <div className={roomStyles["office-room-stats"]}>
        <span>{room.snapshot.agentCount} seated</span>
        <span>{room.snapshot.taskCount} tasks</span>
        <span>{latestFamily}</span>
      </div>
      <div
        className={roomStyles["office-room-scene"]}
        style={{ "--glow-current": glowMap[room.kind] ?? "rgba(80, 141, 212, 0.15)" } as React.CSSProperties}
        aria-hidden="true"
      >
        <div className={roomStyles["office-room-fixtures"]}>
          {room.residents.length === 0 && (
            <span className={ambientStyles["office-room-dust"]} aria-hidden="true" />
          )}
        </div>
        <div className={roomStyles["office-room-avatars"]}>
          {room.visibleResidents.map((resident, index) => {
            const slot = room.schema.slots[index];
            const station = stationMap.get(slot.stationId);
            if (!station) return null;
            const baseLeft = station.left + (slot.offsetX ?? 0);
            const baseTop = station.top + (slot.offsetY ?? 0);
            return (
              <span
                key={resident.agentId}
                role="button"
                tabIndex={0}
                className={[
                  entityStyles["office-room-avatar-slot"],
                  entityStyles[`status-${resident.status}`],
                  resident.agentId === selectedResidentId ? entityStyles.selected : "",
                ].filter(Boolean).join(" ")}
                style={{
                  left: `${baseLeft}%`,
                  top: `${baseTop}%`,
                  "--office-accent": resident.profile.accent,
                  cursor: "grab",
                } as React.CSSProperties}
                data-base-left={baseLeft}
                data-base-top={baseTop}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={(e) => handlePointerUp(e, resident.agentId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelectResident(resident.agentId);
                  }
                }}
              >
                <span className={entityStyles["office-avatar-ring"]} aria-hidden="true" />
                <span className={entityStyles["office-avatar-shadow"]} aria-hidden="true" />
                <OfficeAvatar
                  profile={resident.profile}
                  label={resident.agentId}
                  selected={resident.agentId === selectedResidentId}
                  pose={slot.pose}
                  facing={slot.facing}
                />
                <span
                  className={[
                    ambientStyles["desk-status-led"],
                    resident.status === "error" ? ambientStyles["led-error"] : "",
                  ].filter(Boolean).join(" ")}
                  style={{ "--led-color": getLedColor(resident.status) } as React.CSSProperties}
                  aria-hidden="true"
                />
                {resident.status === "error" && (
                  <span className={`${ambientStyles["office-speech-bubble"]} ${ambientStyles.danger}`}>
                    blocked!
                  </span>
                )}
                {resident.status === "running" && (
                  <span className={`${ambientStyles["office-speech-bubble"]} ${ambientStyles.info}`}>
                    ...
                  </span>
                )}
              </span>
            );
          })}
          {room.overflowCount > 0 && (
            <span
              className={entityStyles["office-room-overflow"]}
              style={{
                left: `${room.schema.overflowSlot.left}%`,
                top: `${room.schema.overflowSlot.top}%`,
              }}
            >
              +{room.overflowCount}
            </span>
          )}
          {room.residents.length === 0 && (
            <span className={entityStyles["office-room-awaiting"]}>
              awaiting crew
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
