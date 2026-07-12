# Conitens Dashboard Design System

## 1. Design Intent

Conitens is an operator console for multi-agent work. The dashboard should feel like a character-first control plane: dense enough for repeated operations, calm enough to scan under pressure, and visually specific enough that agents, handoffs, blocked work, and next operator action are immediately distinguishable.

The pixel office is support scenery, not the protagonist. Operational text, agent identity, handoff state, blocked work, and next actions remain the primary information surfaces. Rooms and fixtures provide light orientation only after the operator can answer who is active, what is blocked, who owns the next handoff, and what to do next.

## 2. Color

The core shell stays dark and utilitarian, using the existing `--shell-*` tokens. Character sprites and status chips should carry the strongest contrast in the preview; office surfaces use desaturated blue-gray and green-gray floors, charcoal walls, and small warm accents only as secondary support. Status colors stay semantically stable: blue for information, green for running, amber for waiting, red for blocked or error.

Pixel assets should avoid cream-heavy or single-hue palettes. The intended balance is charcoal structure, cool floor scaffolding, muted lab greens, small brass or paper accents, and clearly differentiated character silhouettes that read before props do.

## 3. Type

The dashboard uses the existing UI and mono font tokens. Text in shell, workbench, and overview controls should stay compact, with no viewport-width font scaling. Pixel labels may be uppercase, but they should remain secondary to the operator-facing task and handoff copy.

## 4. Space And Layout

The office shell remains capped at `1440px` and must keep the top navigation on one row at `1220px`. Focused mode prioritizes posture metrics, the active handoff chain, explicit next operator action, and character identity for the active handoff participants. Floor Overview owns the spatial map and should not compete with dense cards.

Room interiors can be decorative only when they do not obscure agent placement, route markers, blocked state, current ownership, or per-agent silhouette readability. Character read should win before room read.

## 5. Components

The office visual layer is composed from:

- `office-fixtures.png`: a 25-cell, 24px sprite sheet for classic-room furniture and spatial-lens furniture assets. These stay secondary context.
- `office-floor-*.png`: 24px repeatable floor tiles for room tone and corridor identity.
- Generated spatial-lens room-kit sprites under `public/assets/spatial-lens/generated`.
- Generated agent sprite atlases under `public/agent-sprites/generated`. These are sprite-gen-backed role atlases for orchestrator, implementer, researcher, reviewer, and validator agents, and they are the primary visual differentiators inside preview modes.
- Generated large agent portrait PNGs under `public/agent-portraits/generated`. These are image-generation-backed, role-owned front-facing full-body pixel avatar cutouts used as the Agent stage's primary character read when the operator is looking at the active cast.

The office fixture sheet is generated through the installed `sprite-gen` skill's PNG import, curation, preview, and export path. Agent character atlases are generated directly from role-owned sprite-gen component-row runs (`prepare_sprite_run`, direct component rows, extraction, preview, and atlas composition), then composed into static public assets so runtime code stays dependency-free. Large agent portrait PNGs are runtime-ready derivatives of the approved role avatar designs and should be used when the stage needs a polished full-body character read rather than a compact atlas frame. Character-first redesign work must preserve the no-new-runtime-deps constraint and should prefer generated public assets over hand-drawn canvas avatars or imported character sheets. Agent characters should read as a front-facing full-body pixel human cast: large readable heads and eyes, highlighted hair, clear neck/shoulder/torso structure, arms and hands, separated legs and shoes, role clothing, and role props. The Agent stage should feel like a character lineup, not a floor-map token sheet. Avoid mascot-simple silhouettes, pixel-token poses, sidecar command-center sheets, or Claude/imported character assets when the Agent stage is the primary surface. The current reference direction comes from user-supplied front-facing pixel character images as art direction only: no source pixels or sheets are copied. Dashboard character registries, including Spatial Lens asset registry entries, should reference the generated `public/agent-sprites/generated` atlases for sprite contexts and `public/agent-portraits/generated` for large Agent stage portraits.

## 6. Motion

Motion is restrained and operational. Existing 160ms interaction timing is preferred for hover, selected state, and focus transitions. Agent motion is diversified by role through named profiles: `command-pulse`, `build-shift`, `research-orbit`, `review-scan`, and `verify-brace`. These profiles run on GPU-friendly opacity/transform/filter animation over static atlas frames or portrait cutouts so operators can separate architect, builder, researcher, reviewer, validator, and owner at a glance, while reduced-motion users receive a static version with no semantic loss. Agent-stage character cards render large generated full-body portraits as the primary cast read; room and classic contexts should keep the smaller atlas-backed default scale.

## 7. Depth And Texture

Depth should come from crisp pixel borders, small drop shadows, repeatable tile texture, and clear hierarchy. Avoid noisy room backdrops in Focused mode and keep Overview decluttered: characters, routes, blocked markers, and room identity first; decorative office texture second.
