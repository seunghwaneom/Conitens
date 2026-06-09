# Spatial Lens Pixel Office Reference

This folder contains generated visual references for the Conitens Spatial Lens
pixel office direction. They are project-owned generated references/assets for
Conitens Spatial Lens and should be treated as art direction plus sprite-source
material, not third-party art.

## Generated Images

- `docs/design/assets/spatial-lens/generated/spatial-lens-target-mockup.png`
  - Wide UI reference for the dark operator shell, focused Ops Control camera,
    adjacent Validation Office target, room rail, minimap, and right inspector.
- `docs/design/assets/spatial-lens/generated/ops-control-room-reference.png`
  - Room-level reference for Ops Control furniture clusters: console desks,
    wall status board, server rack, outbox, door/corridor edge, and operator.
- `docs/design/assets/spatial-lens/generated/validation-office-room-reference.png`
  - Room-level reference for Validation Office checkpoint grammar: review gate,
    checklist board, clipboard rack, diff/check monitor, stamp desk, inbox, and
    sentinel.
- `docs/design/assets/spatial-lens/generated/building-floorplate-layout-reference.png`
  - Layout/background-only reference for the shared building shell, inner walls,
    narrow corridor spine, door thresholds, structural columns, and central
    handoff hub. Use this to judge room anchoring before adding props.
- `packages/dashboard/public/assets/spatial-lens/generated/pixel-office-asset-sheet-source.png`
  - Original generated green-screen asset sheet.
- `packages/dashboard/public/assets/spatial-lens/generated/pixel-office-asset-sheet.png`
  - Chroma-keyed transparent source sheet.
- `packages/dashboard/public/assets/spatial-lens/generated/pixel-office-asset-sheet-1x.png`
  - Frontend sprite sheet, nearest-neighbor downsampled 4:1 from the transparent
    source sheet for integer-scale UI rendering.
- `packages/dashboard/public/assets/spatial-lens/generated/ops-control-room-backdrop.png`
  - Public copy of the generated Ops Control room reference, used as subtle
    Focused-mode room material behind authored props.
- `packages/dashboard/public/assets/spatial-lens/generated/validation-office-room-backdrop.png`
  - Public copy of the generated Validation Office room reference, used as
    Focused-mode room material and as the Validation receiving-edge backdrop.

## Intended Usage

- Use the mockup and room references to guide composition, camera framing,
  furniture clustering, handoff visualization, and inspector hierarchy.
- Use `generatedAssetManifest.ts` as the manual slicing contract for generated
  sprites. Do not add fragile automatic slicing unless reliable metadata exists.
- Use `generatedRoomBackdrops.ts` as the generated room backdrop contract. These
  backdrops are Focused-mode material layers, not canonical floor data.
- Prefer generated sprite assets for `PixelProp` rendering when a manifest entry
  exists; keep CSS pixel placeholders as fallback.
- Keep Focused VIEWPORT as the primary live office camera. Floor Overview and
  Classic remain topology/debug support modes.
- Treat the building shell, corridor graph, door alignment, and negative space
  as prerequisites. Adding more furniture or labels does not satisfy a layout
  composition pass.
- Keep canonical data read-only from the floor surface. These assets must not
  introduce new task mutation, approval bypass, or provider-auth actions.

## Art Direction

- 2D orthographic RPG cutaway office.
- Crisp hard-edged pixel art with consistent sprite scale.
- Focused Ops Control camera by default, with nearby corridor and Validation
  Office handoff target when feasible.
- Handoffs appear as in-world packets, outbox/inbox ports, and route markers.
- Blocked lanes appear as in-world barrier/cone objects.
- Room identity should be readable through props before labels.
- Rooms should be embedded in one shared floorplate with visible door
  thresholds and corridor stubs, not isolated rectangles on a void.

## Forbidden Treatments

- Top-down minimap as the default primary camera.
- Pseudo-3D CSS, skewed props, perspective transforms, or soft shadows.
- Generic dashboard-card room thumbnails inside the main VIEWPORT.
- Large opaque overlay labels that dominate room identity.
- SVG-like blue dashed route lines as the primary handoff visual.
- Remote or third-party sprite assets without a separate license review.

## License Note

Generated for Conitens Spatial Lens; project-owned generated visual
reference/assets.
