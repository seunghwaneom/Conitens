import { Fragment, useMemo } from "react";
import type { OfficeHandoffSnapshot } from "../../dashboard-model.js";
import type { OfficeRoomPresence } from "../../office-presence-model.js";
import type { EventRecord, TaskState } from "../../store/event-store.js";
import { GeneratedSprite } from "../assets/GeneratedSprite.js";
import {
  createFocusedHandoffWorkbenchModel,
  type FocusedHandoffWorkbenchModel,
  type FocusedSpatialContext,
} from "../model/focusedHandoffModel.js";
import styles from "../styles/spatial-lens.module.css";
import { GeneratedRoomBackdropLayer } from "../viewport/GeneratedRoomBackdropLayer.js";
import { PixelThemeProvider } from "./PixelPrimitives.js";

interface FocusedHandoffViewProps {
  rooms: OfficeRoomPresence[];
  tasks?: TaskState[];
  handoffs?: OfficeHandoffSnapshot[];
  events?: EventRecord[];
  selectedRoomId: string | null;
  selectedResidentId: string | null;
}

export function FocusedHandoffView({
  rooms,
  tasks = [],
  handoffs = [],
  events = [],
  selectedRoomId,
  selectedResidentId,
}: FocusedHandoffViewProps) {
  const model = useMemo(
    () =>
      createFocusedHandoffWorkbenchModel({
        rooms,
        tasks,
        handoffs,
        events,
        selectedRoomId,
        selectedResidentId,
      }),
    [events, handoffs, rooms, selectedResidentId, selectedRoomId, tasks],
  );

  return (
    <PixelThemeProvider
      className={styles["focused-workbench-root"]}
      data-focused-handoff-view="true"
      data-active-handoff-workbench="true"
      data-workbench-primary="active-handoff"
      data-handoff-chain-task={model.blockedTaskId}
      data-handoff-chain-route={model.routeLabel}
      data-next-operator-action={model.nextActionKind}
      data-next-action-label={model.nextActionLabel}
    >
      <FocusedPostureStrip model={model} />
      <section
        className={styles["focused-workbench-main"]}
        data-focused-view-layer="workbench"
        aria-label="Active handoff workbench"
      >
        <div className={styles["focused-workbench-title-row"]}>
          <div>
            <p className={styles["focused-workbench-kicker"]}>Active Handoff Workbench</p>
            <h3>{model.headline}</h3>
            <span className={styles["focused-workbench-handoff-summary"]}>
              {model.handoffSummaryLabel}
            </span>
          </div>
          <a
            className={styles["focused-workbench-action"]}
            href={model.nextActionHref}
            data-next-action-kind={model.nextActionKind}
          >
            {model.nextActionCtaLabel}
          </a>
        </div>
        <div
          className={styles["focused-workbench-flow"]}
          data-workbench-phase-representation="single"
          data-workbench-step-count={model.steps.length}
        >
          {model.steps.map((step, index) => (
            <Fragment key={step.id}>
              <article
                className={styles["focused-workbench-step"]}
                data-workbench-step={step.id}
                data-workbench-step-phase={step.label.toLowerCase()}
                data-workbench-step-state={step.state.toLowerCase()}
                data-workbench-step-entity={step.entityKind}
                data-workbench-step-tone={step.tone}
              >
                <span className={styles["focused-workbench-step-label"]}>{step.label}</span>
                <strong>{step.primary}</strong>
                <div className={styles["focused-workbench-step-state-row"]}>
                  <span className={styles["focused-workbench-step-state"]}>{step.state}</span>
                  {step.id === "blocked" && model.blockedAgeLabel ? (
                    <span
                      className={styles["focused-workbench-blocked-age"]}
                      data-blocked-age={model.blockedAgeLabel}
                    >
                      {model.blockedAgeLabel}
                    </span>
                  ) : null}
                </div>
                <p>{step.meta}</p>
                <small>{step.detail}</small>
              </article>
              {index < model.steps.length - 1 ? (
                <span
                  className={styles["focused-workbench-connector"]}
                  data-workbench-edge={model.edges[index]?.id}
                  data-workbench-edge-state={model.edges[index]?.state}
                  aria-hidden="true"
                />
              ) : null}
            </Fragment>
          ))}
        </div>
        <div className={styles["focused-workbench-next-action"]}>
          <span>Next operator action</span>
          <strong>{model.nextActionLabel}</strong>
          <small>
            {model.nextActionDetail}
            {model.blockedAgeLabel ? ` / ${model.blockedAgeLabel}` : ""}
          </small>
        </div>
      </section>
      <FocusedSpatialContextStrip contexts={model.spatialContexts} />
    </PixelThemeProvider>
  );
}

function FocusedPostureStrip({
  model,
}: {
  model: FocusedHandoffWorkbenchModel;
}) {
  const metrics = [
    { label: "Live Rooms", value: model.liveRoomCount },
    { label: "Blocked Lanes", value: model.blockedLaneCount },
    { label: "Handoffs", value: model.handoffCount },
    { label: "Current Focus", value: model.currentFocusLabel },
  ];

  return (
    <div
      className={styles["focused-workbench-status"]}
      data-focused-view-layer="posture"
      aria-label="Focused posture"
    >
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className={styles["focused-workbench-status-item"]}
          data-focused-status-metric={metric.label.toLowerCase().replaceAll(" ", "-")}
        >
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
      {model.latestEventLabel ? (
        <div
          className={`${styles["focused-workbench-status-item"]} ${styles["focused-workbench-status-event"]}`}
          data-latest-event={model.latestEventLabel}
          data-focused-status-metric="last-event"
        >
          <span>Last Event</span>
          <strong>{model.latestEventLabel}</strong>
        </div>
      ) : null}
    </div>
  );
}

function FocusedSpatialContextStrip({
  contexts,
}: {
  contexts: readonly FocusedSpatialContext[];
}) {
  return (
    <aside
      className={styles["focused-context-strip"]}
      data-focused-spatial-context="muted"
      data-focused-view-layer="spatial-context"
      aria-label="Muted spatial context"
    >
      {contexts.map((context) => (
        <div
          key={context.id}
          className={styles["focused-context-thumb"]}
          data-context-thumbnail={context.id}
          data-context-room-id={context.roomId ?? ""}
          data-context-tone={context.tone}
        >
          <div className={styles["focused-context-art"]}>
            {context.roomId ? (
              <GeneratedRoomBackdropLayer roomId={context.roomId} />
            ) : (
              <span className={styles["focused-context-gate-grid"]} aria-hidden="true" />
            )}
            <GeneratedSprite
              sprite={context.sprite}
              scale={1}
              className={`${styles["focused-context-sprite"]} ${styles["pixel-generated-sprite"]}`}
            />
          </div>
          <div className={styles["focused-context-copy"]}>
            <strong>{context.label}</strong>
            <span>{context.meta}</span>
            <em>{context.state}</em>
          </div>
        </div>
      ))}
    </aside>
  );
}
