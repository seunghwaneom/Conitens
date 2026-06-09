import {
  ROOM_TEMPLATE_IDS,
  ROOM_TEMPLATES,
  type AgentSlotSpec,
  type HandoffPortSpec,
  type PixelPropKind,
  type PixelPropLayer,
  type PixelPropSpec,
  type PixelPropTone,
  type RoomTemplate,
  type RoomTemplateId,
  type TaskSlotSpec,
  type WorkstationSpec,
} from "./roomTemplates.ts";
import { comparePixelY } from "./pixelSpriteGrammar.ts";

export interface RoomDressingCounts {
  readonly roomId: RoomTemplateId;
  readonly wall: number;
  readonly workstation: number;
  readonly floor: number;
  readonly operational: number;
  readonly handoffPorts: number;
  readonly blockedLaneObjects: number;
  readonly total: number;
}

type RoomTemplateRef = RoomTemplate | RoomTemplateId | string;

export function resolveRoomTemplate(ref: RoomTemplateRef): RoomTemplate | null {
  if (typeof ref !== "string") return ref;
  return ROOM_TEMPLATE_IDS.includes(ref as RoomTemplateId)
    ? ROOM_TEMPLATES[ref as RoomTemplateId]
    : null;
}

export function getWallPropSpecs(ref: RoomTemplateRef): PixelPropSpec[] {
  const template = resolveRoomTemplate(ref);
  if (!template) return [];
  return sortPixelProps(withLayer(template.wallProps, "wall"));
}

export function getWorkstationPropSpecs(ref: RoomTemplateRef): PixelPropSpec[] {
  const template = resolveRoomTemplate(ref);
  if (!template) return [];
  return sortPixelProps(
    template.workstations.flatMap((station) =>
      buildWorkstationProps(template.roomId, station),
    ),
  );
}

export function getRoomFloorPropSpecs(ref: RoomTemplateRef): PixelPropSpec[] {
  const template = resolveRoomTemplate(ref);
  if (!template) return [];
  return sortPixelProps(withLayer(template.props, "floor"));
}

export function getOperationalPropSpecs(ref: RoomTemplateRef): PixelPropSpec[] {
  const template = resolveRoomTemplate(ref);
  if (!template) return [];
  return sortPixelProps([
    ...template.taskSlots.map((slot) => taskSlotToProp(template.roomId, slot)),
    ...template.agentSlots.map((slot) => agentSlotToProp(template.roomId, slot)),
    ...(template.handoffPorts ?? []).map((port) =>
      handoffPortToProp(template.roomId, port),
    ),
    ...withLayer(template.blockedLaneSlots ?? [], "operational"),
  ]);
}

export function getRoomTemplatePropSpecs(ref: RoomTemplateRef): PixelPropSpec[] {
  return [
    ...getWallPropSpecs(ref),
    ...getWorkstationPropSpecs(ref),
    ...getRoomFloorPropSpecs(ref),
    ...getOperationalPropSpecs(ref),
  ];
}

export function getRoomTemplateCounts(): Record<RoomTemplateId, RoomDressingCounts> {
  return ROOM_TEMPLATE_IDS.reduce((counts, roomId) => {
    const template = ROOM_TEMPLATES[roomId];
    const wall = getWallPropSpecs(template).length;
    const workstation = getWorkstationPropSpecs(template).length;
    const floor = getRoomFloorPropSpecs(template).length;
    const operational = getOperationalPropSpecs(template).length;
    counts[roomId] = {
      roomId,
      wall,
      workstation,
      floor,
      operational,
      handoffPorts: template.handoffPorts?.length ?? 0,
      blockedLaneObjects: template.blockedLaneSlots?.length ?? 0,
      total: wall + workstation + floor + operational,
    };
    return counts;
  }, {} as Record<RoomTemplateId, RoomDressingCounts>);
}

export const getRoomDressingPropCounts = getRoomTemplateCounts;

export function getRoomHandoffPort(
  roomId: string,
  role: HandoffPortSpec["role"] | "any",
): HandoffPortSpec | null {
  const template = resolveRoomTemplate(roomId);
  const ports = template?.handoffPorts ?? [];
  if (ports.length === 0) return null;
  if (role === "any") return ports[0] ?? null;
  return (
    ports.find((port) => port.role === role || port.role === "both") ??
    ports[0] ??
    null
  );
}

export function getRoomBlockedLaneSlot(roomId: string): PixelPropSpec | null {
  const template = resolveRoomTemplate(roomId);
  return template?.blockedLaneSlots?.[0] ?? null;
}

function withLayer(
  props: readonly PixelPropSpec[],
  layer: PixelPropLayer,
): PixelPropSpec[] {
  return props.map((prop) => ({ ...prop, layer }));
}

function sortPixelProps(props: readonly PixelPropSpec[]): PixelPropSpec[] {
  return [...props].sort(comparePixelY);
}

function buildWorkstationProps(
  roomId: RoomTemplateId,
  station: WorkstationSpec,
): PixelPropSpec[] {
  const prefix = `${roomId}.${station.id}`;
  const baseTone: PixelPropTone =
    station.kit === "console"
      ? "blue"
      : station.kit === "validation"
        ? "green"
        : station.kit === "review"
          ? "review"
          : station.kit === "lab"
            ? "cool"
            : "neutral";
  const props: PixelPropSpec[] = [
    workstationProp(prefix, "desk", station.x, station.y, {
      w: station.kit === "commons" ? 42 : 34,
      h: station.kit === "lab" ? 15 : 17,
      tone: station.kit === "commons" ? "warm" : baseTone,
    }),
    ...buildSeatProps(prefix, station),
  ];

  if (station.kit === "console") {
    props.push(
      workstationProp(prefix, "monitor", station.x - 6, station.y - 9, { tone: "live" }),
      workstationProp(prefix, "monitor", station.x + 6, station.y - 9, { tone: "blue" }),
      workstationProp(prefix, "keyboard", station.x, station.y + 4, { tone: "neutral" }),
      workstationProp(prefix, "cable", station.x + 12, station.y + 10, {
        w: 26,
        tone: "blue",
      }),
    );
  } else if (station.kit === "developer") {
    props.push(
      workstationProp(prefix, "monitor", station.x - 5, station.y - 8, { tone: "blue" }),
      workstationProp(prefix, "keyboard", station.x - 2, station.y + 4, { tone: "neutral" }),
      workstationProp(prefix, "laptop", station.x + 8, station.y - 2, { tone: "metal" }),
      workstationProp(prefix, "cable", station.x + 10, station.y + 10, {
        w: 28,
        tone: "muted",
      }),
      workstationProp(prefix, "stickyNote", station.x - 12, station.y - 12, {
        tone: "amber",
      }),
    );
  } else if (station.kit === "lab") {
    props.push(
      workstationProp(prefix, "sampleRack", station.x - 9, station.y - 6, { tone: "green" }),
      workstationProp(prefix, "machine", station.x + 8, station.y - 5, {
        w: 20,
        h: 18,
        tone: "metal",
      }),
      workstationProp(prefix, "clipboard", station.x - 2, station.y + 5, { tone: "paper" }),
      workstationProp(prefix, "cable", station.x + 12, station.y + 8, {
        w: 24,
        tone: "muted",
      }),
    );
  } else if (station.kit === "validation") {
    props.push(
      workstationProp(prefix, "monitor", station.x - 6, station.y - 8, { tone: "green" }),
      workstationProp(prefix, "clipboard", station.x + 6, station.y - 4, { tone: "paper" }),
      workstationProp(prefix, "stampPad", station.x + 2, station.y + 5, { tone: "red" }),
      workstationProp(prefix, "keyboard", station.x - 6, station.y + 5, { tone: "neutral" }),
      workstationProp(prefix, "alertLight", station.x + 13, station.y - 10, { tone: "green" }),
    );
  } else if (station.kit === "review") {
    props.push(
      workstationProp(prefix, "laptop", station.x - 6, station.y - 5, { tone: "metal" }),
      workstationProp(prefix, "monitor", station.x + 7, station.y - 9, { tone: "review" }),
      workstationProp(prefix, "documentStack", station.x + 4, station.y + 5, {
        tone: "paper",
      }),
      workstationProp(prefix, "coffeeCup", station.x - 13, station.y + 2, { tone: "warm" }),
      workstationProp(prefix, "clipboard", station.x + 13, station.y + 4, { tone: "paper" }),
    );
  } else {
    props.push(
      workstationProp(prefix, "documentStack", station.x - 9, station.y + 4, {
        tone: "paper",
      }),
      workstationProp(prefix, "coffeeCup", station.x + 8, station.y + 3, { tone: "warm" }),
      workstationProp(prefix, "inboxTray", station.x - 13, station.y - 8, { tone: "green" }),
      workstationProp(prefix, "outboxTray", station.x + 14, station.y - 8, { tone: "blue" }),
      workstationProp(prefix, "routePort", station.x, station.y + 13, { tone: "blue" }),
    );
  }

  return props.map((prop) => ({ ...prop, layer: "workstation" }));
}

function buildSeatProps(prefix: string, station: WorkstationSpec): PixelPropSpec[] {
  const seatCount = Math.max(1, Math.min(station.seats, 4));
  const offsets = seatCount === 1
    ? [{ x: 0, y: 14 }]
    : Array.from({ length: seatCount }, (_, index) => ({
        x: (index - (seatCount - 1) / 2) * 8,
        y: 14 + (index % 2) * 3,
      }));
  return offsets.map((offset, index) =>
    workstationProp(`${prefix}.seat-${index + 1}`, "chair", station.x + offset.x, station.y + offset.y, {
      tone: "warm",
    }),
  );
}

function workstationProp(
  prefix: string,
  kind: PixelPropKind,
  x: number,
  y: number,
  options: Omit<PixelPropSpec, "id" | "kind" | "x" | "y" | "layer"> = {},
): PixelPropSpec {
  return {
    id: `${prefix}.${kind}.${Math.round(x * 10)}.${Math.round(y * 10)}`,
    kind,
    x: clampPercent(x),
    y: clampPercent(y),
    ...options,
  };
}

function taskSlotToProp(roomId: RoomTemplateId, slot: TaskSlotSpec): PixelPropSpec {
  const toneBySlot: Record<TaskSlotSpec["tone"], PixelPropTone> = {
    active: "live",
    queued: "paper",
    blocked: "danger",
    review: "review",
  };
  return {
    id: `${roomId}.task-slot.${slot.id}`,
    kind: slot.propKind ?? "clipboard",
    x: slot.x,
    y: slot.y,
    tone: toneBySlot[slot.tone],
    layer: "operational",
  };
}

function agentSlotToProp(roomId: RoomTemplateId, slot: AgentSlotSpec): PixelPropSpec {
  return {
    id: `${roomId}.agent-slot.${slot.id}`,
    kind: "chair",
    x: slot.x,
    y: slot.y,
    tone: "muted",
    layer: "operational",
  };
}

function handoffPortToProp(roomId: RoomTemplateId, port: HandoffPortSpec): PixelPropSpec {
  const tone: PixelPropTone =
    port.role === "in" ? "green" : port.role === "out" ? "blue" : "live";
  return {
    id: `${roomId}.handoff-port.${port.id}`,
    kind: "routePort",
    x: port.x,
    y: port.y,
    tone,
    layer: "operational",
  };
}

function clampPercent(value: number): number {
  return Math.max(4, Math.min(96, value));
}
