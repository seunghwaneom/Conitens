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
  shouldRenderAgentInOperatorFocusMap,
  type AgentActivityCue,
  type AgentVisualState,
} from "./agentVisualState.js";
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
  operatorFocusOnly = false,
  selectedResidentId,
  onSelectResident,
}: {
  rooms: readonly OfficeRoomPresence[];
  viewportRooms: readonly FloorViewportRoom[];
  tasks?: readonly TaskState[];
  handoffs?: readonly OfficeHandoffSnapshot[];
  operatorFocusOnly?: boolean;
  selectedResidentId: string | null;
  onSelectResident: (agentId: string) => void;
}) {
  const renderedAgents = useMemo(
    () =>
      createRenderedAgents({
        rooms,
        viewportRooms,
        tasks,
        handoffs,
        operatorFocusOnly,
      }),
    [handoffs, operatorFocusOnly, rooms, tasks, viewportRooms],
  );

  return (
    <div
      className={styles["agent-layer"]}
      data-agent-layer="live"
      data-agent-visibility={operatorFocusOnly ? "operator-focus" : "all"}
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

function createRenderedAgents({
  rooms,
  viewportRooms,
  tasks,
  handoffs,
  operatorFocusOnly,
}: {
  rooms: readonly OfficeRoomPresence[];
  viewportRooms: readonly FloorViewportRoom[];
  tasks: readonly TaskState[];
  handoffs: readonly OfficeHandoffSnapshot[];
  operatorFocusOnly: boolean;
}): RenderedAgent[] {
  const roomModelMap = new Map(viewportRooms.map((room) => [room.id, room]));
  const claimedStationIds = new Set<string>();

  return rooms
    .flatMap((room) =>
      room.visibleResidents.map((resident) => {
        const role = mapAgentToVisualRole(resident);
        const state = mapAgentToVisualState(resident, tasks, handoffs);
        const cue = chooseAgentActivityCue(resident, tasks, handoffs);
        if (
          operatorFocusOnly &&
          !shouldRenderAgentInOperatorFocusMap(resident, state, cue)
        ) {
          return null;
        }
        const station = mapAgentToStation(resident, AGENT_STATIONS, {
          visualRole: role,
          excludedStationIds: claimedStationIds,
        });
        const viewportRoom = roomModelMap.get(room.roomId);
        if (!station || !viewportRoom) return null;
        claimedStationIds.add(station.id);
        const point = resolveStationWorldPoint(viewportRoom, station);
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
