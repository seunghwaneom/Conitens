import { useMemo } from "react";
import type { OfficeHandoffSnapshot } from "../../dashboard-model.js";
import type {
  OfficeResidentPresence,
  OfficeRoomPresence,
} from "../../office-presence-model.js";
import type { TaskState } from "../../store/event-store.js";
import type { FloorViewportRoom } from "../model/floorGeometry.js";
import styles from "../styles/spatial-lens.module.css";
import {
  AGENT_STATIONS,
  type AgentStationSpec,
  type AgentVisualRole,
} from "./agentStations.js";
import {
  chooseAgentActivityCue,
  mapAgentToStation,
  mapAgentToVisualRole,
  mapAgentToVisualState,
  type AgentActivityCue,
  type AgentVisualState,
} from "./agentVisualState.js";
import { AgentSprite } from "./AgentSprite.js";
import { AgentStation } from "./AgentStation.js";
import { getPixelLayerIndex } from "./pixelSpriteGrammar.js";

interface RenderedAgent {
  readonly resident: OfficeResidentPresence;
  readonly station: AgentStationSpec;
  readonly role: AgentVisualRole;
  readonly state: AgentVisualState;
  readonly cue: AgentActivityCue;
  readonly roomLabel: string;
  readonly left: number;
  readonly top: number;
  readonly zIndex: number;
}

export function AgentLayer({
  rooms,
  viewportRooms,
  tasks = [],
  handoffs = [],
  selectedResidentId,
  onSelectResident,
}: {
  rooms: readonly OfficeRoomPresence[];
  viewportRooms: readonly FloorViewportRoom[];
  tasks?: readonly TaskState[];
  handoffs?: readonly OfficeHandoffSnapshot[];
  selectedResidentId: string | null;
  onSelectResident: (agentId: string) => void;
}) {
  const renderedAgents = useMemo(
    () => createRenderedAgents({ rooms, viewportRooms, tasks, handoffs }),
    [rooms, viewportRooms, tasks, handoffs],
  );

  return (
    <div
      className={styles["agent-layer"]}
      data-agent-layer="live"
      data-agent-count={renderedAgents.length}
    >
      {renderedAgents.map((agent) => (
        <AgentStation
          key={agent.resident.agentId}
          resident={agent.resident}
          station={agent.station}
          role={agent.role}
          state={agent.state}
          cue={agent.cue}
          selected={agent.resident.agentId === selectedResidentId}
          roomLabel={agent.roomLabel}
          style={{
            left: `${agent.left}%`,
            top: `${agent.top}%`,
            zIndex: agent.zIndex,
          }}
          onSelectResident={onSelectResident}
        />
      ))}
    </div>
  );
}

export function AgentOffscreenRail({
  rooms,
  tasks = [],
  handoffs = [],
  selectedResidentId,
  focusedRoomId,
  targetRoomId,
  onSelectResident,
}: {
  rooms: readonly OfficeRoomPresence[];
  tasks?: readonly TaskState[];
  handoffs?: readonly OfficeHandoffSnapshot[];
  selectedResidentId: string | null;
  focusedRoomId: string | null;
  targetRoomId: string | null;
  onSelectResident: (agentId: string) => void;
}) {
  const offscreenAgents = useMemo(
    () =>
      rooms
        .flatMap((room) =>
          room.visibleResidents.map((resident) => ({
            resident,
            roomLabel: room.label,
            role: mapAgentToVisualRole(resident),
            state: mapAgentToVisualState(resident, tasks, handoffs),
            cue: chooseAgentActivityCue(resident, tasks, handoffs),
          })),
        )
        .filter(
          (agent) =>
            agent.resident.roomId !== focusedRoomId &&
            agent.resident.roomId !== targetRoomId,
        ),
    [focusedRoomId, handoffs, rooms, targetRoomId, tasks],
  );

  if (offscreenAgents.length === 0) return null;

  return (
    <div
      className={styles["agent-offscreen-rail"]}
      data-agent-offscreen-rail="true"
      data-agent-offscreen-treatment="compact-tab"
      data-target-room-id={targetRoomId ?? ""}
      aria-label="Agents outside the focused camera"
    >
      {offscreenAgents.slice(0, 4).map((agent) => (
        <button
          key={`offscreen-${agent.resident.agentId}`}
          type="button"
          className={styles["agent-offscreen-card"]}
          data-agent-offscreen-id={agent.resident.agentId}
          data-agent-id={agent.resident.agentId}
          data-agent-visual-state={agent.state}
          data-agent-cue={agent.cue.kind}
          aria-label={`${agent.resident.agentId}, ${agent.cue.label}, ${agent.roomLabel}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelectResident(agent.resident.agentId);
          }}
        >
          <AgentSprite
            role={agent.role}
            state={agent.state}
            selected={agent.resident.agentId === selectedResidentId}
          />
          <span className={styles["agent-offscreen-copy"]}>
            <strong>{agent.resident.agentId}</strong>
            <span>{agent.roomLabel}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

function createRenderedAgents({
  rooms,
  viewportRooms,
  tasks,
  handoffs,
}: {
  rooms: readonly OfficeRoomPresence[];
  viewportRooms: readonly FloorViewportRoom[];
  tasks: readonly TaskState[];
  handoffs: readonly OfficeHandoffSnapshot[];
}): RenderedAgent[] {
  const roomModelMap = new Map(viewportRooms.map((room) => [room.id, room]));
  const claimedStationIds = new Set<string>();

  return rooms
    .flatMap((room) =>
      room.visibleResidents.map((resident) => {
        const role = mapAgentToVisualRole(resident);
        const state = mapAgentToVisualState(resident, tasks, handoffs);
        const station = mapAgentToStation(resident, AGENT_STATIONS, {
          visualRole: role,
          excludedStationIds: claimedStationIds,
        });
        const viewportRoom = roomModelMap.get(room.roomId);
        if (!station || !viewportRoom) return null;
        claimedStationIds.add(station.id);
        const point = resolveStationWorldPoint(viewportRoom, station);
        const cue = chooseAgentActivityCue(resident, tasks, handoffs);
        return {
          resident,
          station,
          role,
          state,
          cue,
          roomLabel: room.label,
          left: point.left,
          top: point.top,
          zIndex: getPixelLayerIndex({ y: point.top, layer: "operational" }) + 220,
        };
      }),
    )
    .filter((agent): agent is RenderedAgent => agent !== null)
    .sort((left, right) => {
      if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex;
      return left.resident.agentId.localeCompare(right.resident.agentId);
    });
}

function resolveStationWorldPoint(
  room: FloorViewportRoom,
  station: AgentStationSpec,
): {
  readonly left: number;
  readonly top: number;
} {
  return {
    left: room.rect.x + (room.rect.w * station.x) / 100,
    top: room.rect.y + (room.rect.h * station.y) / 100,
  };
}
