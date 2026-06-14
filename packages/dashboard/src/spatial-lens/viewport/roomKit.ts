import {
  ROOM_TEMPLATE_IDS,
  ROOM_TEMPLATES,
  type RoomTemplate,
  type RoomTemplateId,
} from "./roomTemplates.ts";
import type { GeneratedSpatialLensSpriteScale } from "../assets/generatedAssetManifest.js";

export interface RoomKitSpriteSpec {
  readonly id: string;
  readonly sprite: string;
  readonly role: string;
  readonly x: number;
  readonly y: number;
  readonly scale: GeneratedSpatialLensSpriteScale;
  readonly zIndex: number;
}

type RoomTemplateRef = RoomTemplate | RoomTemplateId | string;

const ROOM_KIT_SPRITES = {
  "ops-control": [
    kit("dispatch-screen-bank", "prop.doubleMonitor", "command-screens", 58, 25, 1, 12),
    kit("handoff-audit-ticket", "prop.auditTicket", "curated-audit", 36, 69, 1, 19),
    kit("active-packet", "prop.packet", "handoff-packet", 72, 72, 1, 18),
  ],
  "impl-office": [
    kit("build-archive", "prop.archiveBox", "artifact-archive", 18, 76, 1, 16),
    kit("build-scanner", "prop.checkScanner", "curated-scanner", 80, 56, 1, 17),
    kit("release-notes", "prop.stickyNotes", "release-notes", 62, 24, 1, 8),
  ],
  "research-lab": [
    kit("reagent-cluster", "prop.reagentBottleCluster", "sample-cluster", 48, 67, 1, 16),
    kit("sample-audit-ticket", "prop.auditTicket", "curated-audit", 70, 35, 1, 13),
    kit("sample-machine", "prop.labMachine", "lab-machine", 78, 67, 1, 17),
  ],
  "validation-office": [
    kit("gate-green", "prop.greenStatusLight", "gate-light", 57, 22, 1, 9),
    kit("gate-red", "prop.redStatusLight", "gate-light", 66, 22, 1, 9),
    kit("gate-scanner", "prop.checkScanner", "curated-scanner", 79, 60, 1, 18),
    kit("audit-ticket", "prop.auditTicket", "curated-audit", 44, 72, 1, 21),
    kit("received-packet", "prop.packet", "received-packet", 18, 72, 1, 20),
  ],
  "review-office": [
    kit("archive-box", "prop.archiveBox", "review-archive", 82, 74, 1, 16),
    kit("review-ticket", "prop.auditTicket", "curated-audit", 55, 64, 1, 19),
    kit("diff-packet", "prop.packet", "review-packet", 42, 72, 1, 18),
  ],
  "project-main": [
    kit("shared-packet", "prop.packet", "shared-packet", 52, 31, 1, 14),
    kit("shared-audit-ticket", "prop.auditTicket", "curated-audit", 45, 24, 1, 12),
    kit("commons-archive", "prop.archiveBox", "shared-archive", 22, 73, 1, 15),
  ],
} as const satisfies Record<RoomTemplateId, readonly RoomKitSpriteSpec[]>;

export function getRoomKitSpriteSpecs(
  ref: RoomTemplateRef,
): readonly RoomKitSpriteSpec[] {
  const roomId = resolveRoomId(ref);
  return roomId ? ROOM_KIT_SPRITES[roomId] : [];
}

export function getRoomKitSpriteCounts(): Record<RoomTemplateId, number> {
  return ROOM_TEMPLATE_IDS.reduce(
    (counts, roomId) => {
      counts[roomId] = ROOM_KIT_SPRITES[roomId].length;
      return counts;
    },
    {} as Record<RoomTemplateId, number>,
  );
}

function kit(
  id: string,
  sprite: string,
  role: string,
  x: number,
  y: number,
  scale: GeneratedSpatialLensSpriteScale,
  zIndex: number,
): RoomKitSpriteSpec {
  return { id, sprite, role, x, y, scale, zIndex };
}

function resolveRoomId(ref: RoomTemplateRef): RoomTemplateId | null {
  if (typeof ref !== "string") return ref.roomId;
  return ROOM_TEMPLATE_IDS.includes(ref as RoomTemplateId)
    ? (ref as RoomTemplateId)
    : null;
}
