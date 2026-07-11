import type { CSSProperties } from "react";
import { resolveAgentCharacterPortrait } from "../agent-character-portraits.js";
import { createAgentCharacterStageModel } from "../agent-character-stage-model.js";
import type { OfficeHandoffSnapshot } from "../dashboard-model.js";
import type { OfficeResidentPresence } from "../office-presence-model.js";
import type { TaskState } from "../store/event-store.js";
import stageStyles from "../office-stage.module.css";

export function AgentCharacterStage({
  residents,
  tasks,
  handoffs,
  selectedResidentId,
  onSelectResident,
}: {
  residents: readonly OfficeResidentPresence[];
  tasks: readonly TaskState[];
  handoffs: readonly OfficeHandoffSnapshot[];
  selectedResidentId: string | null;
  onSelectResident: (agentId: string) => void;
}) {
  const model = createAgentCharacterStageModel({ residents, tasks, handoffs, selectedResidentId });

  return (
    <section className={stageStyles["agent-character-stage"]} data-agent-character-stage="true">
      <div className={stageStyles["agent-character-command-strip"]}>
        <div>
          <p className={stageStyles["agent-character-kicker"]}>Agent cast</p>
          <h3>Active agent cast</h3>
        </div>
        <dl className={stageStyles["agent-character-signal-grid"]}>
          <div>
            <dt>handoff</dt>
            <dd>{model.handoffLabel}</dd>
          </div>
          <div>
            <dt>blocked</dt>
            <dd>{model.blockedLabel}</dd>
          </div>
          <div>
            <dt>next</dt>
            <dd>
              <a
                className={stageStyles["agent-character-action"]}
                href={model.nextActionHref}
                data-next-action-kind={model.nextActionKind}
                aria-label={`Next operator action: ${model.nextActionCtaLabel}. ${model.nextActionDetail}`}
              >
                {model.nextActionCtaLabel}
              </a>
            </dd>
          </div>
        </dl>
      </div>

      <div className={stageStyles["agent-character-grid"]}>
        {model.cards.map((card) => {
          const portrait = resolveAgentCharacterPortrait(card.role);
          return (
            <button
              key={card.agentId}
              type="button"
              className={[
                stageStyles["agent-character-card"],
                card.selected ? stageStyles.selected : "",
              ].filter(Boolean).join(" ")}
              data-agent-character-card="true"
              data-agent-id={card.agentId}
              data-agent-role={card.role}
              data-motion-profile={card.motionProfile}
              data-work-state={card.workState.toLowerCase()}
              aria-pressed={card.selected}
              aria-label={`${card.agentId}: ${card.workState}, ${card.taskLabel}, ${card.motionLabel}`}
              style={{ "--office-accent": card.accent } as CSSProperties}
              onClick={() => onSelectResident(card.agentId)}
            >
              <span className={stageStyles["agent-character-figure"]}>
                <span className={stageStyles["agent-character-glow"]} aria-hidden="true" />
                <img
                  className={stageStyles["agent-character-portrait"]}
                  src={portrait.src}
                  width={portrait.width}
                  height={portrait.height}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  data-agent-character-portrait="true"
                  data-agent-avatar-source={portrait.source}
                  data-agent-portrait-role={portrait.role}
                  data-agent-portrait-src={portrait.src}
                />
              </span>
              <span className={stageStyles["agent-character-copy"]}>
                <strong>{card.agentId}</strong>
                <span>{card.archetype}</span>
              </span>
              <span className={stageStyles["agent-character-meta"]}>
                <span>{card.workState}</span>
                <span>{card.taskLabel}</span>
              </span>
              <span className={stageStyles["agent-character-note"]}>
                {card.motionLabel} / {card.signatureProp} / {card.habitLabel}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
