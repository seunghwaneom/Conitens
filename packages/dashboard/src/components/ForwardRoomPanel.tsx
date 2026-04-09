import type { ForwardRoomTimelineResponse } from "../forward-bridge.js";
import type { RoomOptionViewModel } from "../forward-view-model.js";
import { EmptyState, ErrorDisplay, LoadingState } from "../ds/index.js";
import styles from "./ForwardRoomPanel.module.css";

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
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <p className={styles.label}>Spatial Lens</p>
          <h3 className={styles.title}>Room timeline</h3>
        </div>
        <span className={styles.stateTag}>{state}</span>
      </div>
      {roomOptions.length === 0 ? (
        <EmptyState message="No room timeline available for this run." />
      ) : (
        <>
          <div className={styles.roomSelector}>
            {roomOptions.map((room) => (
              <button
                key={room.roomId}
                className={`${styles.chipButton}${selectedRoomId === room.roomId ? ` ${styles.chipButtonActive}` : ""}`}
                onClick={() => onSelectRoom(room.roomId)}
                type="button"
              >
                {room.label}
              </button>
            ))}
          </div>
          {state === "loading" ? <LoadingState message="Loading room timeline..." /> : null}
          {state === "error" && error ? <ErrorDisplay message={error} /> : null}
          {state === "ready" && roomTimeline ? (
            <ol className={styles.timeline}>
              {roomTimeline.timeline.map((item, index) => (
                <li key={`${item.timestamp}-${item.kind}-${index}`} className={styles.timelineItem}>
                  <div className={styles.timelineTopline}>
                    <strong>{item.kind}</strong>
                    <span>{item.timestamp}</span>
                  </div>
                  <p className={styles.timelineSummary}>{item.summary}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  );
}
