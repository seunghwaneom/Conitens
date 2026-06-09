# Spatial Lens Pixel Art Direction

## Camera Model

Spatial Lens VIEWPORT uses a 2D orthographic RPG cutaway office camera. The
main camera focuses one room or room cluster at readable scale. Whole-floor
awareness belongs in a compact minimap, not in the primary pixel office view.

## Projection Rules

- No CSS perspective.
- No transform skew.
- No isometric diagonal projection.
- No soft 3D shadows.
- No blurred glow as depth.
- Use flat pixel sprites or simple orthographic front/side sprites.
- If an object needs depth, use one consistent rule:
  - top face visible
  - front face darker
  - light from upper-left
  - 1px hard shadow only
  - no blur
- Prefer readable flat silhouettes over fake 3D boxes.

## Sprite Scale

- Props use integer sprite scaling only.
- Default prop scale is `2`.
- Outlines are 2px in source CSS before scaling.
- Hard shadows are 1px in source CSS before scaling.
- Characters should read as people, not dots. Character placeholders target a
  24x32 source sprite footprint and display larger than small props.

## Tile Scale

- Room dressing positions snap to a 24x24 room tile field.
- Corridor/minimap positions can remain percentage-based because they are
  navigation aids, not sprite placement.
- Grid dots should never dominate room interiors. Floors should read as
  material bands or tiles, with props and agents carrying the identity.

## Wall Rules

- Rooms are cutaway interiors with a north wall/header band and thin side
  walls.
- Door frames sit in-world near walls and use flat pixel blocks.
- Wall-mounted details align to the wall plane and should not float in the
  middle of the room.

## Furniture Rules

- Furniture is orthographic and flat.
- Desks, tables, racks, and boards use consistent outlines and hard 1px
  shadows.
- Workstations are clusters, not scatter. A workstation can include desk,
  chair, monitor/laptop, keyboard, cable, and one task/object marker.
- Loose props are allowed only when they clarify room function or a route.

## Character Placeholder Rules

- Agents keep the existing pixel avatar path for now.
- Temporary agent/placeholders use stable bottom anchors and y-based layering.
- Do not introduce full AgentSprite lifecycle in this slice.

## Label Rules

- Room names are small in-world plaques near walls or doors.
- Status is a small light/flag in the room, not a dashboard badge.
- Avoid card headers, heavy black overlays, large text blocks, and statistics
  inside room interiors.

## Route And Handoff Rules

- Handoff routes attach to visible route ports, inboxes, or outboxes.
- Routes are crisp pixel segments, beacons, or packet markers.
- Avoid generic dashboard/SaaS dashed SVG lines.
- Blocked lanes should be visible as barrier/cone/stop-marker objects in the
  room, with overlay markers acting only as alignment aids.

## Forbidden Visual Treatments

- CSS `perspective`.
- CSS `skew`.
- Isometric diagonal projection.
- Large soft `box-shadow`.
- Blurred `drop-shadow`.
- Soft glow used as object depth.
- Gradient bevels that imply inconsistent 3D.
- Random prop scatter added only to increase count.
- Dashboard card headers inside room interiors.
- Miniature whole-floor detail as the main VIEWPORT camera.
