import type { FloorViewportRoom } from "../model/floorGeometry.js";
import { FloorMiniMap } from "./FloorMiniMap.js";
import { SceneDockOverlay } from "./SceneDockOverlay.js";

export function MinimapDock({
  rooms,
  focusedRoomId,
  targetRoomId,
  onSelectRoom,
}: {
  rooms: readonly FloorViewportRoom[];
  focusedRoomId: string | null;
  targetRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
}) {
  const hasRouteTarget = Boolean(targetRoomId);

  return (
    <SceneDockOverlay
      label={hasRouteTarget ? "Route Minimap" : "Floor Minimap"}
      role={hasRouteTarget ? "route" : "floor"}
    >
      <FloorMiniMap
        rooms={rooms}
        focusedRoomId={focusedRoomId}
        targetRoomId={targetRoomId}
        onSelectRoom={onSelectRoom}
      />
    </SceneDockOverlay>
  );
}
