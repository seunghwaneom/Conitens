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
          { kind: "console", left: 12, top: 12 },
          { kind: "monitor", left: 30, top: 12 },
          { kind: "terminal", left: 48, top: 12 },
          { kind: "server", left: 70, top: 18 },
        ],
      },
      {
        id: "briefing-wall",
        fixtures: [
          { kind: "board", left: 8, top: 44 },
          { kind: "note", left: 16, top: 54 },
          { kind: "chair", left: 28, top: 64 },
          { kind: "chair", left: 52, top: 64 },
          { kind: "clock", left: 78, top: 10 },
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
        id: "maker-desks",
        fixtures: [
          { kind: "desk", left: 14, top: 18 },
          { kind: "chair", left: 18, top: 38 },
          { kind: "bench", left: 38, top: 58 },
          { kind: "chair", left: 42, top: 76 },
        ],
      },
      {
        id: "support-wall",
        fixtures: [
          { kind: "shelf", left: 72, top: 16 },
          { kind: "cart", left: 74, top: 62 },
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
        id: "reception-edge",
        fixtures: [
          { kind: "reception", left: 10, top: 18 },
          { kind: "reception-return", left: 21, top: 31 },
          { kind: "board", left: 62, top: 16 },
        ],
      },
      {
        id: "commons-furniture",
        fixtures: [
          { kind: "plant", left: 78, top: 22 },
          { kind: "plant", left: 86, top: 80 },
          { kind: "chair", left: 30, top: 66 },
          { kind: "chair", left: 44, top: 66 },
          { kind: "couch", left: 62, top: 70 },
        ],
      },
      {
        id: "commons-table",
        fixtures: [
          { kind: "desk", left: 38, top: 50 },
          { kind: "chair", left: 31, top: 61 },
          { kind: "chair", left: 53, top: 61 },
          { kind: "monitor", left: 45, top: 46 },
          { kind: "note", left: 56, top: 50 },
          { kind: "coffee", left: 34, top: 48 },
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
        id: "analysis-bay",
        fixtures: [
          { kind: "bench", left: 12, top: 18 },
          { kind: "screen", left: 20, top: 12 },
          { kind: "screen", left: 34, top: 12 },
          { kind: "board", left: 10, top: 48 },
          { kind: "note", left: 78, top: 62 },
        ],
      },
      {
        id: "reference-wall",
        fixtures: [
          { kind: "server", left: 46, top: 10 },
          { kind: "rack", left: 58, top: 12 },
          { kind: "cabinet", left: 74, top: 30 },
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
        id: "gate-desk",
        fixtures: [
          { kind: "terminal", left: 12, top: 14 },
          { kind: "monitor", left: 24, top: 14 },
          { kind: "chair", left: 16, top: 34 },
          { kind: "board", left: 50, top: 48 },
        ],
      },
      {
        id: "approval-wall",
        fixtures: [
          { kind: "stamp", left: 60, top: 18 },
          { kind: "note", left: 70, top: 42 },
          { kind: "locker", left: 78, top: 54 },
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
        id: "critique-bay",
        fixtures: [
          { kind: "desk", left: 14, top: 18 },
          { kind: "chair", left: 18, top: 36 },
          { kind: "screen", left: 58, top: 14 },
          { kind: "note", left: 66, top: 34 },
        ],
      },
      {
        id: "detail-wall",
        fixtures: [
          { kind: "lamp", left: 78, top: 58 },
          { kind: "board", left: 48, top: 48 },
          { kind: "cabinet", left: 76, top: 26 },
          { kind: "bench", left: 16, top: 64 },
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
