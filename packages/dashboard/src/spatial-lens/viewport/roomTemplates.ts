export const ROOM_TEMPLATE_IDS = [
  "ops-control",
  "impl-office",
  "research-lab",
  "validation-office",
  "review-office",
  "project-main",
] as const;

export type RoomTemplateId = (typeof ROOM_TEMPLATE_IDS)[number];

export type RoomTemplateTheme =
  | "ops"
  | "impl"
  | "research"
  | "validation"
  | "review"
  | "commons";

export type PixelPropKind =
  | "desk"
  | "chair"
  | "monitor"
  | "keyboard"
  | "laptop"
  | "serverRack"
  | "fileBox"
  | "documentStack"
  | "clipboard"
  | "stampPad"
  | "whiteboard"
  | "statusBoard"
  | "alertLight"
  | "plant"
  | "shelf"
  | "coffeeCup"
  | "cable"
  | "inboxTray"
  | "outboxTray"
  | "barrier"
  | "cone"
  | "routePort"
  | "sampleRack"
  | "machine"
  | "stickyNote"
  | "bulletinBoard";

export const REQUIRED_PIXEL_PROP_KINDS: readonly PixelPropKind[] = [
  "desk",
  "chair",
  "monitor",
  "keyboard",
  "laptop",
  "serverRack",
  "fileBox",
  "documentStack",
  "clipboard",
  "stampPad",
  "whiteboard",
  "statusBoard",
  "alertLight",
  "plant",
  "shelf",
  "coffeeCup",
  "cable",
  "inboxTray",
  "outboxTray",
  "barrier",
  "cone",
  "routePort",
  "sampleRack",
  "machine",
  "stickyNote",
  "bulletinBoard",
];

export const ROOM_TEMPLATE_PROP_MINIMUMS: Record<RoomTemplateId, number> = {
  "ops-control": 18,
  "impl-office": 18,
  "research-lab": 16,
  "validation-office": 18,
  "review-office": 16,
  "project-main": 22,
};

export type PixelPropLayer =
  | "wall"
  | "workstation"
  | "floor"
  | "operational";

export type PixelPropTone =
  | "neutral"
  | "cool"
  | "warm"
  | "live"
  | "review"
  | "danger"
  | "muted"
  | "paper"
  | "plant"
  | "metal"
  | "amber"
  | "green"
  | "red"
  | "blue";

export interface PixelPropSpec {
  readonly id: string;
  readonly kind: PixelPropKind;
  readonly x: number;
  readonly y: number;
  readonly w?: number;
  readonly h?: number;
  readonly tone?: PixelPropTone;
  readonly layer?: PixelPropLayer;
}

export interface DoorSpec {
  readonly id: string;
  readonly side: "north" | "east" | "south" | "west";
  readonly x: number;
  readonly y: number;
  readonly state: "open" | "closed";
}

export interface WorkstationSpec {
  readonly id: string;
  readonly kit:
    | "console"
    | "developer"
    | "lab"
    | "validation"
    | "review"
    | "commons";
  readonly x: number;
  readonly y: number;
  readonly facing: "north" | "east" | "south" | "west";
  readonly seats: number;
}

export interface TaskSlotSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly tone: "active" | "queued" | "blocked" | "review";
  readonly propKind?: PixelPropKind;
}

export interface AgentSlotSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly role: string;
}

export interface HandoffPortSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly direction: "north" | "east" | "south" | "west";
  readonly role: "in" | "out" | "both";
}

export interface RoomTemplate {
  readonly roomId: RoomTemplateId;
  readonly theme: RoomTemplateTheme;
  readonly wallStyle: string;
  readonly floorStyle: string;
  readonly doors: readonly DoorSpec[];
  readonly workstations: readonly WorkstationSpec[];
  readonly props: readonly PixelPropSpec[];
  readonly wallProps: readonly PixelPropSpec[];
  readonly taskSlots: readonly TaskSlotSpec[];
  readonly agentSlots: readonly AgentSlotSpec[];
  readonly blockedLaneSlots?: readonly PixelPropSpec[];
  readonly handoffPorts?: readonly HandoffPortSpec[];
}

const p = (
  id: string,
  kind: PixelPropKind,
  x: number,
  y: number,
  options: Omit<PixelPropSpec, "id" | "kind" | "x" | "y"> = {},
): PixelPropSpec => ({ id, kind, x, y, ...options });

const ws = (
  id: string,
  kit: WorkstationSpec["kit"],
  x: number,
  y: number,
  facing: WorkstationSpec["facing"],
  seats = 1,
): WorkstationSpec => ({ id, kit, x, y, facing, seats });

export const ROOM_TEMPLATES: Record<RoomTemplateId, RoomTemplate> = {
  "ops-control": {
    roomId: "ops-control",
    theme: "ops",
    wallStyle: "command-wall",
    floorStyle: "command-grid",
    doors: [
      { id: "ops-south-door", side: "south", x: 44, y: 96, state: "open" },
    ],
    workstations: [
      ws("lead-console", "console", 22, 42, "south"),
      ws("dispatch-console", "console", 52, 44, "south"),
    ],
    wallProps: [
      p("ops-wall-status", "statusBoard", 18, 12, { w: 40, h: 18, tone: "blue" }),
      p("ops-wall-alert-a", "alertLight", 41, 11, { tone: "red" }),
      p("ops-wall-shift-board", "whiteboard", 58, 12, { w: 34, h: 16, tone: "cool" }),
      p("ops-wall-rack", "shelf", 79, 13, { w: 28, h: 12, tone: "metal" }),
    ],
    props: [
      p("ops-server-rack", "serverRack", 88, 42, { h: 42, tone: "metal" }),
      p("ops-floor-cable-a", "cable", 34, 58, { w: 38, tone: "blue" }),
      p("ops-handoff-outbox", "outboxTray", 42, 84, { tone: "blue" }),
      p("ops-door-docs", "documentStack", 50, 84, { tone: "paper" }),
      p("ops-floor-coffee", "coffeeCup", 65, 74, { tone: "warm" }),
    ],
    taskSlots: [
      { id: "dispatch-active", x: 18, y: 66, tone: "active", propKind: "clipboard" },
      { id: "gate-watch", x: 57, y: 70, tone: "review", propKind: "documentStack" },
    ],
    agentSlots: [
      { id: "architect-seat", x: 22, y: 58, role: "architect" },
      { id: "floor-lead-seat", x: 52, y: 60, role: "lead" },
      { id: "handoff-seat", x: 74, y: 72, role: "handoff" },
    ],
    blockedLaneSlots: [
      p("ops-blocked-barrier", "barrier", 44, 78, { w: 28, h: 16, tone: "danger" }),
      p("ops-blocked-cone", "cone", 38, 78, { tone: "danger" }),
    ],
    handoffPorts: [
      { id: "ops-route-out", x: 44, y: 91, direction: "south", role: "out" },
    ],
  },
  "impl-office": {
    roomId: "impl-office",
    theme: "impl",
    wallStyle: "builder-wall",
    floorStyle: "maker-plank",
    doors: [
      { id: "impl-south-door", side: "south", x: 44, y: 96, state: "open" },
    ],
    workstations: [
      ws("left-builder-desk", "developer", 20, 31, "south"),
      ws("center-build-desk", "developer", 48, 47, "south"),
      ws("release-machine", "developer", 72, 62, "west"),
    ],
    wallProps: [
      p("impl-artifact-shelf", "shelf", 23, 10, { w: 44, h: 12, tone: "warm" }),
      p("impl-build-board", "statusBoard", 54, 11, { w: 34, h: 16, tone: "green" }),
      p("impl-whiteboard", "whiteboard", 76, 13, { w: 30, h: 17, tone: "cool" }),
      p("impl-sticky-a", "stickyNote", 36, 19, { tone: "amber" }),
      p("impl-sticky-b", "stickyNote", 40, 19, { tone: "review" }),
    ],
    props: [
      p("impl-server-rack", "serverRack", 87, 31, { h: 46, tone: "metal" }),
      p("impl-build-machine", "machine", 80, 48, { w: 22, h: 20, tone: "metal" }),
      p("impl-filebox-a", "fileBox", 13, 54, { tone: "warm" }),
      p("impl-filebox-b", "fileBox", 20, 56, { tone: "warm" }),
      p("impl-doc-stack-a", "documentStack", 40, 67, { tone: "paper" }),
      p("impl-doc-stack-b", "documentStack", 63, 76, { tone: "paper" }),
      p("impl-cable-a", "cable", 32, 42, { w: 34, tone: "blue" }),
      p("impl-cable-b", "cable", 62, 63, { w: 38, tone: "muted" }),
      p("impl-laptop-spare", "laptop", 35, 29, { tone: "metal" }),
      p("impl-keyboard-spare", "keyboard", 36, 38, { tone: "neutral" }),
      p("impl-inbox", "inboxTray", 44, 87, { tone: "green" }),
      p("impl-outbox", "outboxTray", 52, 87, { tone: "blue" }),
      p("impl-coffee", "coffeeCup", 72, 77, { tone: "warm" }),
    ],
    taskSlots: [
      { id: "build-slot", x: 25, y: 47, tone: "active", propKind: "clipboard" },
      { id: "artifact-slot", x: 55, y: 69, tone: "queued", propKind: "documentStack" },
    ],
    agentSlots: [
      { id: "builder-a", x: 20, y: 48, role: "builder" },
      { id: "builder-b", x: 48, y: 64, role: "builder" },
      { id: "release-seat", x: 72, y: 76, role: "release" },
    ],
    handoffPorts: [
      { id: "impl-route-both", x: 44, y: 91, direction: "south", role: "both" },
    ],
  },
  "research-lab": {
    roomId: "research-lab",
    theme: "research",
    wallStyle: "lab-wall",
    floorStyle: "quiet-lab",
    doors: [
      { id: "research-south-door", side: "south", x: 11, y: 96, state: "open" },
    ],
    workstations: [
      ws("sample-bench", "lab", 24, 46, "south"),
      ws("analysis-bench", "lab", 58, 57, "south"),
    ],
    wallProps: [
      p("research-whiteboard", "whiteboard", 20, 12, { w: 38, h: 18, tone: "cool" }),
      p("research-sample-shelf", "shelf", 50, 10, { w: 34, h: 12, tone: "metal" }),
      p("research-status-board", "statusBoard", 74, 13, { w: 30, h: 16, tone: "muted" }),
      p("research-bulletin", "bulletinBoard", 88, 34, { w: 24, h: 17, tone: "amber" }),
    ],
    props: [
      p("research-sample-rack-a", "sampleRack", 33, 35, { tone: "green" }),
      p("research-sample-rack-b", "sampleRack", 66, 39, { tone: "blue" }),
      p("research-small-machine", "machine", 82, 54, { w: 22, h: 22, tone: "metal" }),
      p("research-storage-box-a", "fileBox", 82, 74, { tone: "warm" }),
      p("research-storage-box-b", "fileBox", 88, 74, { tone: "warm" }),
      p("research-clipboard-a", "clipboard", 42, 66, { tone: "paper" }),
      p("research-doc-stack", "documentStack", 54, 74, { tone: "paper" }),
      p("research-cable", "cable", 44, 54, { w: 42, tone: "muted" }),
      p("research-plant", "plant", 92, 83, { tone: "plant" }),
      p("research-waiting-marker", "routePort", 11, 84, { tone: "green" }),
      p("research-lab-note", "stickyNote", 69, 24, { tone: "amber" }),
    ],
    taskSlots: [
      { id: "sample-review", x: 27, y: 61, tone: "review", propKind: "clipboard" },
      { id: "analysis-queued", x: 62, y: 72, tone: "queued", propKind: "documentStack" },
    ],
    agentSlots: [
      { id: "researcher-a", x: 24, y: 62, role: "researcher" },
      { id: "analyst-b", x: 58, y: 73, role: "analyst" },
    ],
    handoffPorts: [
      { id: "research-route-both", x: 11, y: 91, direction: "south", role: "both" },
    ],
  },
  "validation-office": {
    roomId: "validation-office",
    theme: "validation",
    wallStyle: "gate-wall",
    floorStyle: "checkpoint-tile",
    doors: [
      { id: "validation-south-door", side: "south", x: 11, y: 96, state: "closed" },
    ],
    workstations: [
      ws("stamp-desk", "validation", 26, 46, "south"),
      ws("review-station", "validation", 60, 56, "south"),
      ws("gate-station", "validation", 80, 46, "west"),
    ],
    wallProps: [
      p("validation-checklist", "statusBoard", 22, 12, { w: 38, h: 18, tone: "green" }),
      p("validation-clipboard-rack", "clipboard", 47, 13, { tone: "paper" }),
      p("validation-green-light", "alertLight", 58, 12, { tone: "green" }),
      p("validation-red-light", "alertLight", 64, 12, { tone: "red" }),
      p("validation-rule-board", "whiteboard", 78, 15, { w: 30, h: 18, tone: "cool" }),
    ],
    props: [
      p("validation-stamp-pad", "stampPad", 28, 37, { tone: "red" }),
      p("validation-gate-barrier", "barrier", 39, 74, { w: 30, h: 16, tone: "danger" }),
      p("validation-gate-cone-a", "cone", 31, 74, { tone: "danger" }),
      p("validation-gate-cone-b", "cone", 48, 74, { tone: "danger" }),
      p("validation-inbox", "inboxTray", 13, 84, { tone: "green" }),
      p("validation-outbox", "outboxTray", 23, 84, { tone: "blue" }),
      p("validation-review-queue", "documentStack", 55, 78, { tone: "paper" }),
      p("validation-filebox", "fileBox", 83, 72, { tone: "warm" }),
      p("validation-clipboard-a", "clipboard", 68, 70, { tone: "paper" }),
      p("validation-clipboard-b", "clipboard", 72, 70, { tone: "paper" }),
      p("validation-cable", "cable", 54, 48, { w: 40, tone: "muted" }),
      p("validation-coffee", "coffeeCup", 74, 62, { tone: "warm" }),
    ],
    taskSlots: [
      { id: "receiving-queue", x: 15, y: 72, tone: "queued", propKind: "documentStack" },
      { id: "active-check", x: 58, y: 70, tone: "review", propKind: "clipboard" },
      { id: "blocked-review", x: 40, y: 84, tone: "blocked", propKind: "barrier" },
    ],
    agentSlots: [
      { id: "validator-a", x: 26, y: 62, role: "validator" },
      { id: "reviewer-b", x: 60, y: 72, role: "reviewer" },
      { id: "gate-guard", x: 80, y: 62, role: "gate" },
    ],
    blockedLaneSlots: [
      p("validation-blocked-barrier", "barrier", 39, 82, { w: 28, h: 16, tone: "danger" }),
      p("validation-blocked-cone", "cone", 50, 82, { tone: "danger" }),
    ],
    handoffPorts: [
      { id: "validation-route-in", x: 13, y: 91, direction: "south", role: "in" },
      { id: "validation-route-out", x: 23, y: 91, direction: "south", role: "out" },
    ],
  },
  "review-office": {
    roomId: "review-office",
    theme: "review",
    wallStyle: "review-wall",
    floorStyle: "quiet-review",
    doors: [
      { id: "review-south-door", side: "south", x: 11, y: 96, state: "open" },
    ],
    workstations: [
      ws("diff-desk", "review", 25, 44, "south"),
      ws("annotation-table", "review", 62, 55, "south"),
    ],
    wallProps: [
      p("review-annotation-board", "whiteboard", 24, 12, { w: 40, h: 18, tone: "cool" }),
      p("review-bulletin", "bulletinBoard", 54, 14, { w: 28, h: 18, tone: "amber" }),
      p("review-archive-shelf", "shelf", 78, 14, { w: 32, h: 12, tone: "warm" }),
      p("review-status", "statusBoard", 82, 33, { w: 26, h: 15, tone: "muted" }),
    ],
    props: [
      p("review-diff-monitor", "monitor", 30, 32, { tone: "review" }),
      p("review-doc-stack-a", "documentStack", 42, 62, { tone: "paper" }),
      p("review-doc-stack-b", "documentStack", 52, 69, { tone: "paper" }),
      p("review-archive-box", "fileBox", 83, 75, { tone: "warm" }),
      p("review-coffee", "coffeeCup", 70, 64, { tone: "warm" }),
      p("review-clipboard", "clipboard", 60, 75, { tone: "paper" }),
      p("review-cable", "cable", 44, 51, { w: 34, tone: "muted" }),
      p("review-quiet-port", "routePort", 12, 84, { tone: "muted" }),
      p("review-plant", "plant", 90, 83, { tone: "plant" }),
      p("review-sticky-a", "stickyNote", 58, 26, { tone: "amber" }),
      p("review-sticky-b", "stickyNote", 62, 26, { tone: "review" }),
    ],
    taskSlots: [
      { id: "diff-review", x: 25, y: 61, tone: "review", propKind: "clipboard" },
      { id: "archive-queue", x: 65, y: 75, tone: "queued", propKind: "documentStack" },
    ],
    agentSlots: [
      { id: "reviewer-a", x: 25, y: 61, role: "reviewer" },
      { id: "reviewer-b", x: 62, y: 72, role: "reviewer" },
    ],
    handoffPorts: [
      { id: "review-route-both", x: 12, y: 91, direction: "south", role: "both" },
    ],
  },
  "project-main": {
    roomId: "project-main",
    theme: "commons",
    wallStyle: "commons-wall",
    floorStyle: "commons-stage",
    doors: [
      { id: "commons-north-door", side: "north", x: 52, y: 5, state: "open" },
      { id: "commons-east-door", side: "east", x: 91, y: 30, state: "closed" },
    ],
    workstations: [
      ws("pickup-table", "commons", 30, 45, "south", 2),
      ws("shared-table", "commons", 55, 48, "south", 3),
      ws("crew-table", "commons", 74, 62, "west", 2),
    ],
    wallProps: [
      p("commons-bulletin", "bulletinBoard", 20, 11, { w: 42, h: 18, tone: "amber" }),
      p("commons-route-board", "statusBoard", 50, 10, { w: 34, h: 16, tone: "blue" }),
      p("commons-shelf", "shelf", 75, 12, { w: 36, h: 12, tone: "warm" }),
      p("commons-whiteboard", "whiteboard", 84, 31, { w: 30, h: 18, tone: "cool" }),
    ],
    props: [
      p("commons-inbox", "inboxTray", 47, 18, { tone: "green" }),
      p("commons-outbox", "outboxTray", 57, 18, { tone: "blue" }),
      p("commons-plant-a", "plant", 10, 76, { tone: "plant" }),
      p("commons-plant-b", "plant", 89, 78, { tone: "plant" }),
      p("commons-docs-a", "documentStack", 36, 61, { tone: "paper" }),
      p("commons-docs-b", "documentStack", 62, 64, { tone: "paper" }),
      p("commons-docs-c", "documentStack", 77, 73, { tone: "paper" }),
      p("commons-filebox-a", "fileBox", 17, 69, { tone: "warm" }),
      p("commons-filebox-b", "fileBox", 22, 70, { tone: "warm" }),
      p("commons-coffee-a", "coffeeCup", 44, 45, { tone: "warm" }),
      p("commons-coffee-b", "coffeeCup", 70, 55, { tone: "warm" }),
      p("commons-route-node-a", "routePort", 52, 23, { tone: "blue" }),
      p("commons-route-node-b", "routePort", 88, 42, { tone: "blue" }),
      p("commons-sticky-a", "stickyNote", 28, 24, { tone: "amber" }),
      p("commons-sticky-b", "stickyNote", 33, 24, { tone: "review" }),
      p("commons-cable", "cable", 48, 58, { w: 48, tone: "muted" }),
      p("commons-laptop-spare", "laptop", 25, 35, { tone: "metal" }),
    ],
    taskSlots: [
      { id: "pickup-queue", x: 36, y: 70, tone: "queued", propKind: "documentStack" },
      { id: "staging-active", x: 54, y: 70, tone: "active", propKind: "clipboard" },
      { id: "handoff-waiting", x: 78, y: 78, tone: "review", propKind: "routePort" },
    ],
    agentSlots: [
      { id: "commons-a", x: 30, y: 61, role: "advisor" },
      { id: "commons-b", x: 55, y: 65, role: "advisor" },
      { id: "commons-c", x: 74, y: 78, role: "advisor" },
    ],
    handoffPorts: [
      { id: "commons-route-north", x: 52, y: 9, direction: "north", role: "both" },
      { id: "commons-route-east", x: 88, y: 31, direction: "east", role: "both" },
    ],
  },
};

export function getRoomTemplate(roomId: string): RoomTemplate | null {
  return ROOM_TEMPLATE_IDS.includes(roomId as RoomTemplateId)
    ? ROOM_TEMPLATES[roomId as RoomTemplateId]
    : null;
}
