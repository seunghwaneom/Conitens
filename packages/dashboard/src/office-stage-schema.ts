import type { OfficeAvatarFacing, OfficeAvatarPose } from "./office-avatar-sprites.ts";
import type { OfficeRoomPriority } from "./office-system.ts";

export type OfficeStageRoomKind =
  | "lobby"
  | "control"
  | "workspace"
  | "lab"
  | "validation"
  | "review";

export type OfficeStageTeamId =
  | "plan_team"
  | "refactor_team"
  | "research_team"
  | "review_team"
  | "design_team"
  | "advising_team";

export interface OfficeStageFixturePlacement {
  kind: string;
  left: number;
  top: number;
}

export interface OfficeStageFixtureCluster {
  id: string;
  fixtures: OfficeStageFixturePlacement[];
}

export interface OfficeStageDoor {
  left: number;
  top: number;
  state: "open" | "closed";
}

export interface OfficeStageWindow {
  left: number;
  top: number;
  width: number;
}

export interface OfficeStageStationAnchor {
  id: string;
  left: number;
  top: number;
}

export interface OfficeStageTaskAnchor {
  left: number;
  top: number;
}

export interface OfficeStageSlot {
  stationId: string;
  pose?: OfficeAvatarPose;
  facing?: OfficeAvatarFacing;
  offsetX?: number;
  offsetY?: number;
}

export interface OfficeStageOverflowSlot {
  left: number;
  top: number;
}

export interface OfficeStageRoomSchema {
  roomId: string;
  label: string;
  kind: OfficeStageRoomKind;
  teamId: OfficeStageTeamId;
  teamLabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floorTone?: OfficeStageRoomKind;
  priority: OfficeRoomPriority;
  fixtureClusters: OfficeStageFixtureCluster[];
  stationAnchors: OfficeStageStationAnchor[];
  taskAnchors: OfficeStageTaskAnchor[];
  handoffAnchor: OfficeStageTaskAnchor;
  doors: OfficeStageDoor[];
  windows: OfficeStageWindow[];
  slots: OfficeStageSlot[];
  overflowSlot: OfficeStageOverflowSlot;
}

export interface OfficeStageCorridorSchema {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OfficeStageCorridorFixture {
  kind: "extinguisher" | "clock" | "bulletin";
  left: number;
  top: number;
}

export interface OfficeStageFocalLane {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const OFFICE_STAGE_ROOMS: OfficeStageRoomSchema[] = [
  {
    roomId: "ops-control",
    label: "Ops Control",
    kind: "control",
    teamId: "plan_team",
    teamLabel: "Plan Team",
    x: 3,
    y: 3,
    w: 28,
    h: 17,
    floorTone: "control",
    priority: "hero",
    fixtureClusters: [
      {
        id: "dispatch-wall",
        fixtures: [
          { kind: "console", left: 10, top: 12 },
          { kind: "monitor", left: 28, top: 12 },
          { kind: "terminal", left: 46, top: 12 },
          { kind: "clock", left: 82, top: 12 },
        ],
      },
      {
        id: "ops-stations",
        fixtures: [
          { kind: "chair", left: 32, top: 30 },
          { kind: "server", left: 78, top: 28 },
          { kind: "console", left: 52, top: 30 },
        ],
      },
      {
        id: "briefing-corner",
        fixtures: [
          { kind: "board", left: 8, top: 50 },
          { kind: "note", left: 8, top: 64 },
        ],
      },
    ],
    stationAnchors: [
      { id: "dispatch-a", left: 18, top: 62 },
      { id: "dispatch-b", left: 46, top: 67 },
      { id: "dispatch-c", left: 70, top: 56 },
    ],
    taskAnchors: [
      { left: 14, top: 24 },
      { left: 58, top: 26 },
    ],
    handoffAnchor: { left: 44, top: 92 },
    doors: [{ left: 42, top: 95, state: "open" }],
    windows: [{ left: 10, top: 0, width: 22 }],
    slots: [
      { stationId: "dispatch-a", pose: "stand", facing: "right", offsetX: -1, offsetY: 0 },
      { stationId: "dispatch-b", pose: "sit", facing: "down" },
      { stationId: "dispatch-c", pose: "guard", facing: "left", offsetX: 1, offsetY: -1 },
    ],
    overflowSlot: { left: 82, top: 76 },
  },
  {
    roomId: "impl-office",
    label: "Impl Office",
    kind: "workspace",
    teamId: "refactor_team",
    teamLabel: "Refactor Team",
    x: 3,
    y: 24,
    w: 28,
    h: 26,
    floorTone: "workspace",
    priority: "support",
    fixtureClusters: [
      {
        id: "workstation-left",
        fixtures: [
          { kind: "desk", left: 12, top: 16 },
          { kind: "monitor", left: 18, top: 12 },
          { kind: "lamp", left: 8, top: 14 },
          { kind: "chair", left: 16, top: 32 },
        ],
      },
      {
        id: "workstation-center",
        fixtures: [
          { kind: "bench", left: 36, top: 42 },
          { kind: "note", left: 42, top: 38 },
          { kind: "chair", left: 34, top: 56 },
          { kind: "chair", left: 48, top: 56 },
          { kind: "desk", left: 52, top: 44 },
          { kind: "monitor", left: 58, top: 40 },
        ],
      },
      {
        id: "supply-wall",
        fixtures: [
          { kind: "shelf", left: 76, top: 12 },
          { kind: "cabinet", left: 76, top: 32 },
          { kind: "cart", left: 76, top: 52 },
          { kind: "coffee", left: 78, top: 72 },
          { kind: "note", left: 64, top: 68 },
        ],
      },
    ],
    stationAnchors: [
      { id: "impl-a", left: 20, top: 48 },
      { id: "impl-b", left: 42, top: 66 },
      { id: "impl-c", left: 70, top: 54 },
    ],
    taskAnchors: [
      { left: 18, top: 24 },
      { left: 50, top: 57 },
    ],
    handoffAnchor: { left: 44, top: 92 },
    doors: [{ left: 42, top: 95, state: "open" }],
    windows: [{ left: 12, top: 0, width: 20 }],
    slots: [
      { stationId: "impl-a", pose: "sit", facing: "down" },
      { stationId: "impl-b", pose: "lean", facing: "right", offsetX: 1 },
      { stationId: "impl-c", pose: "stand", facing: "left", offsetY: -1 },
    ],
    overflowSlot: { left: 82, top: 80 },
  },
  {
    roomId: "project-main",
    label: "Central Commons",
    kind: "lobby",
    teamId: "advising_team",
    teamLabel: "Advising Team",
    x: 7,
    y: 64,
    w: 49,
    h: 28,
    floorTone: "lobby",
    priority: "hero",
    fixtureClusters: [
      {
        id: "reception-zone",
        fixtures: [
          { kind: "reception", left: 8, top: 18 },
          { kind: "reception-return", left: 19, top: 30 },
          { kind: "plant", left: 4, top: 42 },
          { kind: "lamp", left: 4, top: 18 },
        ],
      },
      {
        id: "commons-table",
        fixtures: [
          { kind: "desk", left: 36, top: 38 },
          { kind: "monitor", left: 42, top: 34 },
          { kind: "chair", left: 32, top: 52 },
          { kind: "chair", left: 48, top: 52 },
          { kind: "note", left: 52, top: 38 },
          { kind: "coffee", left: 34, top: 36 },
          { kind: "note", left: 44, top: 50 },
          { kind: "lamp", left: 28, top: 40 },
        ],
      },
      {
        id: "lounge-zone",
        fixtures: [
          { kind: "couch", left: 66, top: 60 },
          { kind: "plant", left: 80, top: 56 },
          { kind: "plant", left: 88, top: 78 },
          { kind: "lamp", left: 82, top: 42 },
          { kind: "coffee", left: 72, top: 74 },
          { kind: "bench", left: 58, top: 74 },
        ],
      },
      {
        id: "info-wall",
        fixtures: [
          { kind: "board", left: 60, top: 14 },
          { kind: "clock", left: 78, top: 14 },
          { kind: "bulletin", left: 88, top: 14 },
        ],
      },
      {
        id: "handoff-strip",
        fixtures: [
          { kind: "note", left: 28, top: 80 },
          { kind: "note", left: 36, top: 80 },
          { kind: "note", left: 44, top: 80 },
          { kind: "note", left: 52, top: 80 },
          { kind: "coffee", left: 62, top: 78 },
          { kind: "plant", left: 72, top: 82 },
        ],
      },
    ],
    stationAnchors: [
      { id: "commons-a", left: 20, top: 44 },
      { id: "commons-b", left: 46, top: 64 },
      { id: "commons-c", left: 76, top: 76 },
    ],
    taskAnchors: [
      { left: 24, top: 30 },
      { left: 62, top: 56 },
    ],
    handoffAnchor: { left: 25, top: 3 },
    doors: [
      { left: 22, top: 0, state: "open" },
      { left: 88, top: 28, state: "closed" },
    ],
    windows: [
      { left: 8, top: 0, width: 16 },
      { left: 60, top: 0, width: 22 },
    ],
    slots: [
      { stationId: "commons-a", pose: "desk", facing: "right" },
      { stationId: "commons-b", pose: "stand", facing: "left" },
      { stationId: "commons-c", pose: "stand", facing: "down" },
    ],
    overflowSlot: { left: 90, top: 78 },
  },
  {
    roomId: "research-lab",
    label: "Research Lab",
    kind: "lab",
    teamId: "research_team",
    teamLabel: "Research Team",
    x: 61,
    y: 3,
    w: 33,
    h: 16,
    floorTone: "lab",
    priority: "support",
    fixtureClusters: [
      {
        id: "analysis-bench",
        fixtures: [
          { kind: "bench", left: 10, top: 22 },
          { kind: "screen", left: 16, top: 12 },
          { kind: "screen", left: 32, top: 12 },
          { kind: "lamp", left: 8, top: 12 },
          { kind: "board", left: 10, top: 46 },
          { kind: "note", left: 10, top: 60 },
        ],
      },
      {
        id: "server-bay",
        fixtures: [
          { kind: "server", left: 74, top: 12 },
          { kind: "rack", left: 84, top: 12 },
          { kind: "cabinet", left: 78, top: 38 },
        ],
      },
    ],
    stationAnchors: [
      { id: "lab-a", left: 18, top: 60 },
      { id: "lab-b", left: 48, top: 66 },
      { id: "lab-c", left: 78, top: 52 },
    ],
    taskAnchors: [
      { left: 16, top: 28 },
      { left: 73, top: 63 },
    ],
    handoffAnchor: { left: 12, top: 92 },
    doors: [{ left: 10, top: 95, state: "open" }],
    windows: [{ left: 44, top: 0, width: 18 }],
    slots: [
      { stationId: "lab-a", pose: "desk", facing: "right" },
      { stationId: "lab-b", pose: "sit", facing: "down" },
      { stationId: "lab-c", pose: "lean", facing: "left" },
    ],
    overflowSlot: { left: 86, top: 76 },
  },
  {
    roomId: "validation-office",
    label: "Validation Office",
    kind: "validation",
    teamId: "review_team",
    teamLabel: "Review Team",
    x: 61,
    y: 23,
    w: 33,
    h: 16,
    floorTone: "validation",
    priority: "hero",
    fixtureClusters: [
      {
        id: "gate-checkpoint",
        fixtures: [
          { kind: "terminal", left: 10, top: 14 },
          { kind: "monitor", left: 24, top: 14 },
          { kind: "chair", left: 14, top: 34 },
          { kind: "chair", left: 28, top: 34 },
          { kind: "stamp", left: 38, top: 16 },
        ],
      },
      {
        id: "approval-wall",
        fixtures: [
          { kind: "board", left: 56, top: 14 },
          { kind: "note", left: 56, top: 34 },
          { kind: "clock", left: 84, top: 12 },
          { kind: "locker", left: 80, top: 30 },
          { kind: "locker", left: 80, top: 52 },
        ],
      },
    ],
    stationAnchors: [
      { id: "validation-a", left: 20, top: 60 },
      { id: "validation-b", left: 49, top: 67 },
      { id: "validation-c", left: 78, top: 50 },
    ],
    taskAnchors: [
      { left: 20, top: 22 },
      { left: 57, top: 59 },
    ],
    handoffAnchor: { left: 12, top: 92 },
    doors: [{ left: 10, top: 95, state: "closed" }],
    windows: [{ left: 52, top: 0, width: 14 }],
    slots: [
      { stationId: "validation-a", pose: "guard", facing: "right" },
      { stationId: "validation-b", pose: "sit", facing: "down" },
      { stationId: "validation-c", pose: "guard", facing: "left" },
    ],
    overflowSlot: { left: 86, top: 76 },
  },
  {
    roomId: "review-office",
    label: "Review Office",
    kind: "review",
    teamId: "design_team",
    teamLabel: "Design Team",
    x: 61,
    y: 56,
    w: 33,
    h: 20,
    floorTone: "review",
    priority: "quiet",
    fixtureClusters: [
      {
        id: "review-station",
        fixtures: [
          { kind: "desk", left: 10, top: 16 },
          { kind: "screen", left: 16, top: 12 },
          { kind: "lamp", left: 6, top: 12 },
          { kind: "chair", left: 14, top: 34 },
          { kind: "note", left: 28, top: 18 },
        ],
      },
      {
        id: "reference-wall",
        fixtures: [
          { kind: "board", left: 54, top: 14 },
          { kind: "cabinet", left: 78, top: 14 },
          { kind: "cabinet", left: 78, top: 36 },
          { kind: "lamp", left: 84, top: 58 },
        ],
      },
    ],
    stationAnchors: [
      { id: "review-a", left: 20, top: 58 },
      { id: "review-b", left: 49, top: 66 },
      { id: "review-c", left: 78, top: 51 },
    ],
    taskAnchors: [
      { left: 18, top: 24 },
      { left: 58, top: 48 },
    ],
    handoffAnchor: { left: 12, top: 92 },
    doors: [{ left: 10, top: 95, state: "open" }],
    windows: [{ left: 48, top: 0, width: 16 }],
    slots: [
      { stationId: "review-a", pose: "inspect", facing: "right" },
      { stationId: "review-b", pose: "sit", facing: "down" },
      { stationId: "review-c", pose: "inspect", facing: "left" },
    ],
    overflowSlot: { left: 86, top: 82 },
  },
];

export const OFFICE_STAGE_CORRIDORS: OfficeStageCorridorSchema[] = [
  { x: 35, y: 0, w: 22, h: 100 },
  { x: 0, y: 82, w: 62, h: 14 },
];

export const OFFICE_STAGE_CORRIDOR_FIXTURES: OfficeStageCorridorFixture[] = [
  { kind: "clock", left: 45, top: 18 },
  { kind: "bulletin", left: 47, top: 44 },
  { kind: "extinguisher", left: 52, top: 78 },
];

export const OFFICE_STAGE_FOCAL_LANES: OfficeStageFocalLane[] = [
  { x: 42.4, y: 14, w: 6.2, h: 58 },
  { x: 22, y: 72.2, w: 23.6, h: 5.4 },
];
