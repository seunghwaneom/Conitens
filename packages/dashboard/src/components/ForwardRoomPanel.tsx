import type { ForwardRoomTimelineResponse } from "../forward-bridge.js";
import type { RoomOptionViewModel } from "../forward-view-model.js";

export function ForwardRoomPanel({
  roomOptions,
  selectedRoomId,
  onSelectRoom,
  roomTimeline,
  state,
  error,
}: {
  roomOptions: RoomOptionViewModel[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  roomTimeline: ForwardRoomTimelineResponse | null;
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
}) {
  return (
    <section className="forward-section">
      <div className="forward-section-header">
        <div>
          <p className="forward-panel-label">Spatial Lens</p>
          <h3>Room timeline</h3>
        </div>
        <span className={`forward-state state-${state}`}>{state}</span>
      </div>
      {roomOptions.length === 0 ? (
        <p className="forward-empty">No room timeline available for this run.</p>
      ) : (
        <>
          <div className="forward-room-selector">
            {roomOptions.map((room) => (
              <button
                key={room.roomId}
                className={`forward-chip-button${selectedRoomId === room.roomId ? " active" : ""}`}
                onClick={() => onSelectRoom(room.roomId)}
                type="button"
              >
                {room.label}
              </button>
            ))}
          </div>
          {state === "loading" ? <p className="forward-empty">Loading room timeline...</p> : null}
          {state === "error" ? <p className="forward-error">{error}</p> : null}
          {state === "ready" && roomTimeline ? (
            <ol className="forward-timeline">
              {roomTimeline.timeline.map((item, index) => (
                <li key={`${item.timestamp}-${item.kind}-${index}`}>
                  <div className="forward-timeline-topline">
                    <strong>{item.kind}</strong>
                    <span>{item.timestamp}</span>
                  </div>
                  <p>{item.summary}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}
