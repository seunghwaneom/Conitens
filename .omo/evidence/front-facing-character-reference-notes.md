# Front-Facing Agent Character Reference Notes

Date: 2026-06-28

User correction: the previous top-view office/RPG direction was the wrong direction. The active art direction is now front-facing, full-body pixel human characters that read like a character-select lineup.

User-supplied reference labels:

- `codex-clipboard-11b0d6b3-front-facing-full-body-pixel-boy.png`: large readable head and eyes, full-body portrait proportions, highlighted hair, shirt/trousers/shoes, strong dark outline.
- `codex-clipboard-c73a6cca-front-facing-pixel-character-lineup.png`: multiple human character silhouettes with role/costume differentiation and consistent front-facing stance.
- `codex-clipboard-3a0ec65f-front-facing-rpg-character-lineup.png`: compact RPG-like lineup with simple readable bodies, faces, and costume color blocking.

Implementation rule:

- Use these images as art direction only. Do not copy source pixels or import sheets.
- Generated agents should be upright front-facing full-body humans, not floor-map tokens.
- Preserve the direct sprite-gen component-row pipeline and generated public atlas runtime contract.
- Runtime source stays `packages/dashboard/public/agent-sprites/generated`.
